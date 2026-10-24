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
type PlayerIndex = 0 | 1 | 2 | 3
type Strategy = (previousBids: readonly Bid[], card: Card) => Bid
type OutcomeCounts = { wins: number; losses: number }
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

const deriveStrategy = (playerIndex: PlayerIndex, previousStrategies: readonly Strategy[]): Strategy => {
  if (previousStrategies.length !== playerIndex) {
    throw new Error("Expected one strategy for each previous player")
  }

  const outcomes = new Map<string, OutcomeCounts>()

  for (const [trick, winningIndex] of generateTricksAndWinner()) {
    const previousBids: Bid[] = []

    for (const [index, strategy] of previousStrategies.entries()) {
      previousBids.push(strategy(previousBids, trick[index]))
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

    return counts.wins >= counts.losses ? 1 : 0
  }
}

const p1Strategy = deriveStrategy(0, [])
const p1Bid = (card: Card): Bid => p1Strategy([], card)

const p2Strategy = deriveStrategy(1, [p1Strategy])
const p2Bid = (player1Bid: Bid, card: Card): Bid => p2Strategy([player1Bid], card)

console.log(p2Bid(1, { suit: "♠️", rank: "J" }))
