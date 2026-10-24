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

const isBetter = (cardA: Card, cardB: Card, suitLed: Suit): boolean => {
  if (cardA.suit === cardB.suit) {
    return rankValue[cardA.rank] > rankValue[cardB.rank]
  }

  if (cardA.suit === trumpSuit) {
    return true
  }

  if (cardB.suit === trumpSuit) {
    return false
  }

  if (cardA.suit === suitLed) {
    return true
  }

  return false
}

const getWinningIndex = (cards: readonly Card[]) => {
  let bestCard: Card | undefined
  let suitLed: Suit | undefined
  let bestIndex: number = -1
  
  for (const [index, card] of cards.entries()) {
    suitLed = suitLed ?? card.suit
    if (!bestCard || isBetter(card, bestCard, suitLed)) {
      bestIndex = index
      bestCard = card
    }
  }

  return bestIndex
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

const deriveP1Strategy = (): (cP1: Card) => Bid => {
  const winLossMap = new Map<`${Suit}${Rank}`, [win: number, loss: number]>()

  for (const [[{ suit, rank }], winner] of generateTricksAndWinner()) {
    const key = `${suit}${rank}` as const
    let tally = winLossMap.get(key) 

    if (!tally) {
      tally = [0, 0]
      winLossMap.set(key, tally)
    }
    
    const incrementIndex = winner === 0 ? 0 : 1

    tally[incrementIndex] += 1
  }

  return ({ suit, rank }: Card) => {
    const key = `${suit}${rank}` as const
    const [win, loss] = winLossMap.get(key)!

    return win >= loss ? 1 : 0
  }
}

const p1Bid = deriveP1Strategy()

const deriveP2Strategy = (): (bP1: Bid, cP2: Card) => Bid => {
  const winLossMap = new Map<`${Bid}-${Suit}${Rank}`, [win: number, loss: number]>()

  for (const [[p1card, { suit, rank }], winner] of generateTricksAndWinner()) {
    const key = `${p1Bid(p1card)}-${suit}${rank}` as const
    let tally = winLossMap.get(key)

    if (!tally) {
      tally = [0, 0]
      winLossMap.set(key, tally)
    }

    const incrementIndex = winner === 1 ? 0 : 1

    tally[incrementIndex] += 1
  }

  return (bP1: Bid, { suit, rank }: Card) => {
    const key = `${bP1}-${suit}${rank}` as const

    const [win, loss] = winLossMap.get(key)!

    return win >= loss ? 1 : 0
  }
}

const p2Bid = deriveP2Strategy()

console.log(p2Bid(1, { suit: "♠️", rank: "J"}))

// TODO: return bid AND confidence level / odds of winning trick
