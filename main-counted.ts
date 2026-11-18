const playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 = 3
const correctBidBonus = 10
const pointsPerTrick = 1
const awardTrickPointsOnMiss = true

if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
  throw new Error("playerCount must be an integer from 2 to 8")
}

const suits = ["♠️", "♥️", "♦️", "♣️"] as const

type Suit = (typeof suits)[number]

const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const

type Rank = (typeof ranks)[number]

const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const

type Value = (typeof values)[number]

const rankValue: Record<Rank, Value> = {
  A: 13,
  K: 12,
  Q: 11,
  J: 10,
  "10": 9,
  "9": 8,
  "8": 7,
  "7": 6,
  "6": 5,
  "5": 4,
  "4": 3,
  "3": 2,
  "2": 1,
}

type Card = {
  readonly suit: Suit
  readonly rank: Rank
}

const fullDeck: readonly Card[] = suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })))

const trumpIndicatorCard = fullDeck.find(({ suit, rank }) => suit === "♠️" && rank === "2")!

const trumpSuit = trumpIndicatorCard.suit

const beatsCurrentWinner = (candidate: Card, currentWinner: Card, ledSuit: Suit, trumpSuit: Suit): boolean => {
  if (candidate.suit === currentWinner.suit) {
    return rankValue[candidate.rank] > rankValue[currentWinner.rank]
  }

  if (candidate.suit === trumpSuit) {
    return true
  }

  if (currentWinner.suit === trumpSuit) {
    return false
  }

  if (candidate.suit === ledSuit) {
    return true
  }

  return false
}

const availableDeck: readonly Card[] = fullDeck.filter((card) => card !== trumpIndicatorCard)

type Bid = 0 | 1
type StrategyResult = {
  bid: Bid
  wins: number
  losses: number
  totalScenarios: number
  winProbability: number
  expectedPointsFromBidOne: number
  expectedPointsFromBidZero: number
}
type Strategy = (previousBids: readonly Bid[], card: Card) => StrategyResult | undefined
type CardKey = `${Suit}${Rank}`

const cardKey = ({ suit, rank }: Card): CardKey => `${suit}${rank}` as const

const stateKey = (previousBids: readonly Bid[], card: Card): string => `${previousBids.join(",")}|${cardKey(card)}`

const generateBidHistories = function* (length: number): Generator<Bid[]> {
  if (length === 0) {
    yield []
    return
  }

  for (const previousBids of generateBidHistories(length - 1)) {
    yield [0, ...previousBids]
    yield [1, ...previousBids]
  }
}

type OpponentCard = { card: Card; eligiblePreviousSeats: number }

const countDeals = (
  cards: readonly OpponentCard[],
  previousPlayerCount: number,
  laterPlayerCount: number,
  requiredLeadSuit?: Suit,
): number => {
  if (cards.length < previousPlayerCount + laterPlayerCount) return 0

  // Each mask represents the earlier seats already assigned distinct cards that match their bids.
  const allPreviousSeats = (1 << previousPlayerCount) - 1
  const assignments = new Float64Array(allPreviousSeats + 1)
  assignments[0] = 1
  const leadSeat = 1

  for (const { card, eligiblePreviousSeats } of cards) {
    const eligibleSeats =
      requiredLeadSuit && card.suit !== requiredLeadSuit ? eligiblePreviousSeats & ~leadSeat : eligiblePreviousSeats
    if (eligibleSeats === 0) continue

    // Updating larger masks first prevents the same card being assigned to multiple seats.
    for (let filledSeats = allPreviousSeats - 1; filledSeats >= 0; filledSeats--) {
      const ways = assignments[filledSeats]
      if (ways === 0) continue

      let openSeats = eligibleSeats & ~filledSeats
      while (openSeats !== 0) {
        const seat = openSeats & -openSeats
        assignments[filledSeats | seat] += ways
        openSeats ^= seat
      }
    }
  }

  // Once the earlier bids match, each assignment allows the same number of later draws.
  let deals = assignments[allPreviousSeats]
  for (let seat = 0; seat < laterPlayerCount; seat++) {
    deals *= cards.length - previousPlayerCount - seat
  }
  return deals
}

const deriveStrategy = (previousStrategies: readonly Strategy[]): Strategy => {
  const playerIndex = previousStrategies.length
  const laterPlayerCount = playerCount - playerIndex - 1
  const results = new Map<string, StrategyResult>()

  // Trick points cancel out of the bid comparison when awarded either way.
  const bidOneWeight = correctBidBonus + (awardTrickPointsOnMiss ? 0 : pointsPerTrick)

  for (const previousBids of generateBidHistories(playerIndex)) {
    const earlierBidders = previousStrategies.map((strategy, seat) => ({
      strategy,
      earlierBids: previousBids.slice(0, seat),
      bid: previousBids[seat],
    }))
    const cards = availableDeck.map((card) => {
      let eligiblePreviousSeats = 0
      for (const [seat, { strategy, earlierBids, bid }] of earlierBidders.entries()) {
        if (strategy(earlierBids, card)?.bid === bid) eligiblePreviousSeats |= 1 << seat
      }
      return { card, eligiblePreviousSeats }
    })

    for (const { card } of cards) {
      const opponents = cards.filter((opponent) => opponent.card !== card)
      const totalScenarios = countDeals(opponents, playerIndex, laterPlayerCount)
      if (totalScenarios === 0) continue

      const nonBeatingCards = opponents.filter(
        (opponent) => !beatsCurrentWinner(opponent.card, card, card.suit, trumpSuit),
      )
      // A non-trump can only win from a later seat when its suit was led.
      const requiredLeadSuit = playerIndex > 0 && card.suit !== trumpSuit ? card.suit : undefined
      const wins = countDeals(nonBeatingCards, playerIndex, laterPlayerCount, requiredLeadSuit)
      const losses = totalScenarios - wins
      const bidOnePoints = wins * bidOneWeight
      const bidZeroPoints = losses * correctBidBonus
      const trickPointsEitherWay = awardTrickPointsOnMiss ? wins * pointsPerTrick : 0

      results.set(stateKey(previousBids, card), {
        bid: bidOnePoints >= bidZeroPoints ? 1 : 0,
        wins,
        losses,
        totalScenarios,
        winProbability: wins / totalScenarios,
        expectedPointsFromBidOne: (bidOnePoints + trickPointsEitherWay) / totalScenarios,
        expectedPointsFromBidZero: (bidZeroPoints + trickPointsEitherWay) / totalScenarios,
      })
    }
  }

  return (previousBids, card) => {
    if (previousBids.length !== playerIndex) {
      throw new Error(`Expected ${playerIndex} previous bids`)
    }

    return results.get(stateKey(previousBids, card))
  }
}

const strategies: Strategy[] = []
for (let seat = 0; seat < playerCount; seat++) {
  strategies.push(deriveStrategy(strategies))
}

const trumpCards = availableDeck.filter((card) => card.suit === trumpSuit)
// The three non-trump suits are interchangeable, so one suit represents all three in the table.
const nonTrumpSuit = suits.find((suit) => suit !== trumpSuit)
const nonTrumpCards = availableDeck.filter((card) => card.suit === nonTrumpSuit)

const describeBidOneRanks = (strategy: Strategy, previousBids: readonly Bid[], cards: readonly Card[]): string => {
  const bids = cards.map((card) => ({ rank: card.rank, bid: strategy(previousBids, card)?.bid }))
  if (bids.every(({ bid }) => bid === undefined)) return "Impossible"

  const bidOneRanks = bids.filter(({ bid }) => bid === 1).map(({ rank }) => rank)
  const lowestBidOneRank = bidOneRanks.at(-1)
  if (lowestBidOneRank === undefined) return "Never"
  if (bidOneRanks.length === cards.length) return "Any"
  if (bidOneRanks.length === 1) return lowestBidOneRank

  if (bids.slice(0, bidOneRanks.length).every(({ bid }) => bid === 1)) {
    return `${lowestBidOneRank} or higher`
  }

  return bidOneRanks.join(", ")
}

for (const [playerIndex, strategy] of strategies.entries()) {
  const rows = [...generateBidHistories(playerIndex)].map((previousBids, rowIndex) => {
    return {
      Player: rowIndex === 0 ? `P${playerIndex + 1}` : "",
      "Previous bids": previousBids.join(", ") || "—",
      "Trump (bid 1)": describeBidOneRanks(strategy, previousBids, trumpCards),
      "Non-trump (bid 1)": describeBidOneRanks(strategy, previousBids, nonTrumpCards),
    }
  })

  console.table(rows)
}

console.log(strategies[0]([], { suit: "♥️", rank: "A" }))

export {}
