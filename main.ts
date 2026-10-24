 const suits = ["♠️", "♥️", "♦️", "♣️"] as const

type Suit = (typeof suits)[number]

const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const

type Rank = (typeof ranks)[number]

const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const

type Value = (typeof values)[number]

const rankValue: Record<Rank, Value> = {
  "A": 13,
  "K": 12,
  "Q": 11,
  "J": 10,
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

const trumpIndicatorCard = { suit: "♠️", rank: "2"} as const satisfies Card

const trumpSuit = trumpIndicatorCard.suit

type Card = {
  readonly suit: Suit
  readonly rank: Rank
}

const beatsCurrentWinner = (candidate: Card, currentWinner: Card, ledSuit: Suit): boolean => {
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

const getWinningIndex = (cards: readonly Card[]) => {
  let winningCard: Card | undefined
  let ledSuit: Suit | undefined
  let winningIndex = -1
  
  for (const [index, card] of cards.entries()) {
    ledSuit = ledSuit ?? card.suit
    if (!winningCard || beatsCurrentWinner(card, winningCard, ledSuit)) {
      winningIndex = index
      winningCard = card
    }
  }

  return winningIndex
}

type Trick = readonly [Card, Card, Card, Card]

const fullDeck: readonly Card[] = suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })))

const availableDeck = function* (): Generator<Card> {
  for (const card of fullDeck) {
    if (card.suit === trumpIndicatorCard.suit && card.rank === trumpIndicatorCard.rank) continue
    yield card
  }
}

const generateTricks = function* (): Generator<Trick> {
  for (const card1 of availableDeck()) {
    for (const card2 of availableDeck()) {
      if (card2 === card1) continue

      for (const card3 of availableDeck()) {
        if (card3 === card1 || card3 === card2) continue

        for (const card4 of availableDeck()) {
          if (card4 === card1 || card4 === card2 || card4 === card3) continue
          yield [card1, card2, card3, card4]
        }
      }
    }
  }
}

const generateTricksAndWinner = function* (): Generator<[Trick, number]> {
  for (const trick of generateTricks()) {
    yield [trick, getWinningIndex(trick)]
  }
}

type Bid = 0 | 1
type BidHistory = {
  0: readonly []
  1: readonly [Bid]
  2: readonly [Bid, Bid]
  3: readonly [Bid, Bid, Bid]
}
type PlayerIndex = keyof BidHistory & number
type OutcomeCounts = { wins: number; losses: number }
type StrategyResult = OutcomeCounts & {
  bid: Bid
  totalScenarios: number
  winProbability: number
}
type Strategy<I extends PlayerIndex> = (previousBids: BidHistory[I], card: Card) => StrategyResult
type PreviousStrategies<I extends PlayerIndex> =
  I extends 0 ? readonly [] :
  I extends 1 ? readonly [Strategy<0>] :
  I extends 2 ? readonly [Strategy<0>, Strategy<1>] :
  readonly [Strategy<0>, Strategy<1>, Strategy<2>]
type CardKey = `${Suit}${Rank}`

const cardKey = ({ suit, rank }: Card): CardKey => `${suit}${rank}` as const

const stateKey = (previousBids: readonly Bid[], card: Card): string =>
  `${previousBids.join(",")}|${cardKey(card)}`

const recordOutcome = (outcomes: Map<string, OutcomeCounts>, key: string, won: boolean): void => {
  let counts = outcomes.get(key)
  if (!counts) {
    counts = { wins: 0, losses: 0 }
    outcomes.set(key, counts)
  }

  if (won) {
    counts.wins += 1
  } else {
    counts.losses += 1
  }
}

const deriveStrategy = <I extends PlayerIndex>(
  playerIndex: I,
  previousStrategies: PreviousStrategies<I>,
): Strategy<I> => {
  if (previousStrategies.length !== playerIndex) {
    throw new Error("Expected one strategy for each previous player")
  }

  const outcomes = new Map<string, OutcomeCounts>()

  for (const [trick, winningIndex] of generateTricksAndWinner()) {
    const previousBids: Bid[] = []

    for (const [index, strategy] of previousStrategies.entries()) {
      // Each strategy receives the bids collected from exactly its predecessors.
      const previousStrategy = strategy as (previousBids: readonly Bid[], card: Card) => StrategyResult
      previousBids.push(previousStrategy(previousBids, trick[index]).bid)
    }

    recordOutcome(outcomes, stateKey(previousBids, trick[playerIndex]), winningIndex === playerIndex)
  }

  return (previousBids, card) => {
    if (previousBids.length !== playerIndex) {
      throw new Error(`Expected ${playerIndex} previous bids`)
    }

    const key = stateKey(previousBids, card)
    const counts = outcomes.get(key)
    if (!counts) throw new Error(`No outcomes for ${key}`)

    const { wins, losses } = counts
    const totalScenarios = wins + losses

    return {
      bid: wins >= losses ? 1 : 0,
      wins,
      losses,
      totalScenarios,
      winProbability: wins / totalScenarios,
    }
  }
}

const p1Strategy = deriveStrategy(0, [])
const p2Strategy = deriveStrategy(1, [p1Strategy])
const p3Strategy = deriveStrategy(2, [p1Strategy, p2Strategy])
const p4Strategy = deriveStrategy(3, [p1Strategy, p2Strategy, p3Strategy])


console.log(p4Strategy([1, 1, 1], { suit: "♠️", rank: "A" }))
