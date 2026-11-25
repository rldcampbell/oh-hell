const playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 = 8
const correctBidBonus = 10
const pointsPerTrick = 1
const awardTrickPointsOnMiss = false

const suits = ["♠️", "♥️", "♦️", "♣️"] as const
const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const

type Suit = (typeof suits)[number]
type Rank = (typeof ranks)[number]
type Card = { suit: Suit; rank: Rank }
type Bid = 0 | 1

const trumpSuit: Suit = "♠️"
const trumpIndicatorRank: Rank = "2"
const trumpRanks = ranks.filter((rank) => rank !== trumpIndicatorRank)
const nonTrumpSuits = suits.filter((suit) => suit !== trumpSuit)
const nonTrumpSuit = nonTrumpSuits[0]
const availableDeck: readonly Card[] = [
  ...ranks.flatMap((rank) => nonTrumpSuits.map((suit) => ({ suit, rank }))),
  ...trumpRanks.map((rank) => ({ suit: trumpSuit, rank })),
]

// The lead is unknown at bid time. Non-trumps of the same rank share one
// bid rank, and the available trumps rank above all of them.
const representativeCards = availableDeck.filter(({ suit }) => suit === nonTrumpSuit || suit === trumpSuit)
const neverBidOne = representativeCards.length

const countDeckCardsBelow = (cutoff: number): number =>
  nonTrumpSuits.length * Math.min(cutoff, ranks.length) + Math.max(0, cutoff - ranks.length)

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
type SeatStrategy = { cutoffs: ReadonlyMap<string, number>; strategy: Strategy }
type BidCutoff = { bid: Bid; cutoff: number }

const stateKey = (previousBids: readonly Bid[], { suit, rank }: Card): string =>
  `${previousBids.join(",")}|${suit === trumpSuit ? trumpSuit : nonTrumpSuit}${rank}`

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

const countOrderedDraws = (cardsLeft: number, seatsLeft: number): number => {
  if (cardsLeft < seatsLeft) return 0
  let ways = 1
  for (let seat = 0; seat < seatsLeft; seat++) ways *= cardsLeft - seat
  return ways
}

type DealCounter = (cardCount: number, countCardsBelow: (cutoff: number) => number) => number

const createDealCounter = (earlierBids: readonly BidCutoff[], seatCount: number): DealCounter => {
  const zeroCutoffs = earlierBids.filter(({ bid }) => bid === 0).map(({ cutoff }) => cutoff)
  const oneCutoffs = earlierBids.filter(({ bid }) => bid === 1).map(({ cutoff }) => cutoff)
  const useLowerPools = zeroCutoffs.length >= oneCutoffs.length
  const required = useLowerPools ? zeroCutoffs : oneCutoffs
  const opposite = useLowerPools ? oneCutoffs : zeroCutoffs

  // Inclusion-exclusion expands the smaller group. Each opposite bid means
  // "any card" minus "a card on this side of the cutoff".
  const terms = [{ cutoffs: required, sign: 1 }]
  for (const cutoff of opposite) {
    terms.push(...terms.map(({ cutoffs, sign }) => ({ cutoffs: [...cutoffs, cutoff], sign: -sign })))
  }
  for (const { cutoffs } of terms) {
    cutoffs.sort((a, b) => (useLowerPools ? a - b : b - a))
  }

  return (cardCount, countCardsBelow) => {
    let deals = 0
    for (const { cutoffs, sign } of terms) {
      let assignments = 1
      // Each pool contains all the smaller pools. Every assigned card therefore
      // removes exactly one choice from each pool that follows it.
      for (let assignedSeats = 0; assignedSeats < cutoffs.length; assignedSeats++) {
        const below = countCardsBelow(cutoffs[assignedSeats])
        const poolSize = useLowerPools ? below : cardCount - below
        const choices = poolSize - assignedSeats
        if (choices <= 0) {
          assignments = 0
          break
        }
        assignments *= choices
      }
      deals += sign * assignments * countOrderedDraws(cardCount - cutoffs.length, seatCount - cutoffs.length)
    }
    return deals
  }
}

const countTrumpWins = (bidRank: number, countDeals: DealCounter): number => {
  // A trump only loses to higher trumps, whatever was led. Cap each earlier
  // bidder's pool at our rank so it contains only cards our trump can beat.
  return countDeals(countDeckCardsBelow(bidRank), (cutoff) => countDeckCardsBelow(Math.min(cutoff, bidRank)))
}

const countSafeNonTrumpsBelow = (ownRank: number, cutoff: number = ranks.length): number => {
  // When our suit is led, both off-suits are harmless. Their ranks still
  // matter for deciding whether they fit an earlier bid cutoff.
  const offSuitRanks = Math.min(cutoff, ranks.length)
  const lowerRanksInOurSuit = Math.min(cutoff, ownRank)
  return (nonTrumpSuits.length - 1) * offSuitRanks + lowerRanksInOurSuit
}

const createNonTrumpWinCounter = (earlierBids: readonly BidCutoff[]): ((ownRank: number) => number) => {
  const [leader, ...otherBids] = earlierBids
  if (!leader) return (ownRank) => countOrderedDraws(countSafeNonTrumpsBelow(ownRank), playerCount - 1)

  // Every opponent must have a non-trump, and P1 must lead a lower card of our suit.
  if (earlierBids.some(({ bid, cutoff }) => bid === 1 && cutoff >= ranks.length)) return () => 0
  const firstLead = leader.bid === 1 ? leader.cutoff : 0
  const leadRankLimit = leader.bid === 0 ? leader.cutoff : ranks.length
  const restrictedBids = otherBids.filter(({ cutoff }) => cutoff < ranks.length)
  const countAfterLead = createDealCounter(restrictedBids, playerCount - 2)

  return (ownRank) => {
    const leadLimit = Math.min(leadRankLimit, ownRank)
    if (firstLead >= leadLimit) return 0

    const cardsAfterLead = countSafeNonTrumpsBelow(ownRank) - 1
    if (restrictedBids.length === 0) {
      return (leadLimit - firstLead) * countOrderedDraws(cardsAfterLead, playerCount - 2)
    }

    let wins = 0
    for (let lead = firstLead; lead < leadLimit; lead++) {
      wins += countAfterLead(
        cardsAfterLead,
        (cutoff) => countSafeNonTrumpsBelow(ownRank, cutoff) - Number(lead < cutoff),
      )
    }
    return wins
  }
}

const scoreBids = (wins: number, totalScenarios: number): StrategyResult => {
  const losses = totalScenarios - wins
  const bidOnePoints = wins * (correctBidBonus + pointsPerTrick)
  const bidZeroPoints = losses * correctBidBonus + (awardTrickPointsOnMiss ? wins * pointsPerTrick : 0)
  return {
    bid: bidOnePoints >= bidZeroPoints ? 1 : 0,
    wins,
    losses,
    totalScenarios,
    winProbability: wins / totalScenarios,
    expectedPointsFromBidOne: bidOnePoints / totalScenarios,
    expectedPointsFromBidZero: bidZeroPoints / totalScenarios,
  }
}

const findEarlierCutoffs = (previousStrategies: readonly SeatStrategy[], previousBids: readonly Bid[]) => {
  const earlierBids: BidCutoff[] = []
  for (const [seat, bid] of previousBids.entries()) {
    const cutoff = previousStrategies[seat].cutoffs.get(previousBids.slice(0, seat).join(","))
    if (cutoff === undefined) return undefined
    earlierBids.push({ bid, cutoff })
  }
  return earlierBids
}

const deriveStrategy = (previousStrategies: readonly SeatStrategy[]): SeatStrategy => {
  const playerIndex = previousStrategies.length
  const cutoffs = new Map<string, number>()
  const results = new Map<string, StrategyResult>()

  for (const previousBids of generateBidHistories(playerIndex)) {
    const earlierBids = findEarlierCutoffs(previousStrategies, previousBids)
    if (!earlierBids) continue

    const countDeals = createDealCounter(earlierBids, playerCount - 1)
    const countNonTrumpWins = createNonTrumpWinCounter(earlierBids)
    const earlierCutoffs = new Set(earlierBids.map(({ cutoff }) => cutoff))
    let totalScenarios = 0
    let cutoff = neverBidOne
    let possible = false

    for (const [bidRank, card] of representativeCards.entries()) {
      // Removing our card changes the total only when its bid rank crosses an earlier cutoff.
      if (bidRank === 0 || earlierCutoffs.has(bidRank)) {
        totalScenarios = countDeals(
          availableDeck.length - 1,
          (earlierCutoff) => countDeckCardsBelow(earlierCutoff) - Number(bidRank < earlierCutoff),
        )
      }
      if (totalScenarios === 0) continue

      const wins = card.suit === trumpSuit ? countTrumpWins(bidRank, countDeals) : countNonTrumpWins(bidRank)
      const result = scoreBids(wins, totalScenarios)
      results.set(stateKey(previousBids, card), result)
      possible = true

      if (result.bid === 1) cutoff = Math.min(cutoff, bidRank)
      else if (cutoff !== neverBidOne) throw new Error(`Expected one cutoff for bids [${previousBids.join(", ")}]`)
    }

    // A complete deal reproducing the history can only reach possible holdings,
    // so gaps for impossible cards do not affect later seats' use of this cutoff.
    if (possible) cutoffs.set(previousBids.join(","), cutoff)
  }

  const strategy: Strategy = (previousBids, card) => {
    if (previousBids.length !== playerIndex) throw new Error(`Expected ${playerIndex} previous bids`)
    return results.get(stateKey(previousBids, card))
  }
  return { cutoffs, strategy }
}

const seatStrategies: SeatStrategy[] = []
for (let seat = 0; seat < playerCount; seat++) {
  seatStrategies.push(deriveStrategy(seatStrategies))
}

const trumpCards = representativeCards.filter(({ suit }) => suit === trumpSuit).reverse()
const nonTrumpCards = representativeCards.filter(({ suit }) => suit === nonTrumpSuit).reverse()

const describeBidOneRanks = (strategy: Strategy, previousBids: readonly Bid[], cards: readonly Card[]): string => {
  const bids = cards.map((card) => ({ rank: card.rank, bid: strategy(previousBids, card)?.bid }))
  if (bids.every(({ bid }) => bid === undefined)) return "Impossible"

  const bidOneRanks = bids.filter(({ bid }) => bid === 1).map(({ rank }) => rank)
  const lowestBidOneRank = bidOneRanks.at(-1)
  if (lowestBidOneRank === undefined) return "Never"
  if (bidOneRanks.length === cards.length) return "Any"
  if (bidOneRanks.length === 1) return lowestBidOneRank
  if (bids.slice(0, bidOneRanks.length).every(({ bid }) => bid === 1)) return `${lowestBidOneRank} or higher`
  return bidOneRanks.join(", ")
}

for (const [playerIndex, { strategy }] of seatStrategies.entries()) {
  const rows = [...generateBidHistories(playerIndex)].map((previousBids, rowIndex) => ({
    Player: rowIndex === 0 ? `P${playerIndex + 1}` : "",
    "Previous bids": previousBids.join(", ") || "—",
    "Trump (bid 1)": describeBidOneRanks(strategy, previousBids, trumpCards),
    "Non-trump (bid 1)": describeBidOneRanks(strategy, previousBids, nonTrumpCards),
  }))
  console.table(rows)
}

export {}
