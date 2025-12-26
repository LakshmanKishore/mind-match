import type { PlayerId, RuneClient } from "rune-sdk"

export type Operator = '+' | '−' | '×' | '÷'

export interface Equation {
  id: number
  val1: number
  val2: number
  operator: Operator
  result: number
  claimedBy: PlayerId | null // New: Who claimed this equation
}

export interface PlayerState {
  score: number
  lastAction?: 'hit' | 'miss' | 'pass'
}

export interface GameState {
  equations: Equation[] // Now static
  diceValue: number | null
  players: Record<PlayerId, PlayerState>
  currentPlayerIndex: number
  playerIds: PlayerId[]
  phase: 'rolling' | 'claiming'
  winner: PlayerId | null
}

type GameActions = {
  rollDice: () => void
  claimEquation: (equationId: number) => void
  pass: () => void
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

// Helper to generate a valid equation with result 1-10
function generateEquation(id: number): Equation {
  while (true) {
    const operatorIdx = Math.floor(Math.random() * 4)
    const operator = ['+', '−', '×', '÷'][operatorIdx] as Operator
    let val1 = 0, val2 = 0, result = 0

    if (operator === '+') {
      val1 = Math.floor(Math.random() * 9) + 1
      val2 = Math.floor(Math.random() * (10 - val1)) + 1
      result = val1 + val2
    } else if (operator === '−') {
      val1 = Math.floor(Math.random() * 10) + 2
      val2 = Math.floor(Math.random() * (val1 - 1)) + 1
      result = val1 - val2
    } else if (operator === '×') {
      val1 = Math.floor(Math.random() * 5) + 1
      val2 = Math.floor(Math.random() * 5) + 1
      result = val1 * val2
    } else if (operator === '÷') {
      val2 = Math.floor(Math.random() * 5) + 1
      result = Math.floor(Math.random() * 10) + 1
      val1 = result * val2
    }

    if (result >= 1 && result <= 10) {
      return { id, val1, val2, operator, result, claimedBy: null }
    }
  }
}

Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 6,
  setup: (allPlayerIds) => {
    const equations: Equation[] = []
    for (let i = 0; i < 10; i++) {
      equations.push(generateEquation(i))
    }

    const players: Record<PlayerId, PlayerState> = {}
    for (const pid of allPlayerIds) {
      players[pid] = { score: 0 }
    }

    return {
      equations,
      diceValue: null,
      players,
      currentPlayerIndex: 0,
      playerIds: allPlayerIds,
      phase: 'rolling',
      winner: null,
    }
  },
  actions: {
    rollDice: (_, { game, playerId }) => {
      if (game.winner) return
      if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()
      if (game.phase !== 'rolling') throw Rune.invalidAction()

      game.diceValue = Math.floor(Math.random() * 10) + 1
      game.phase = 'claiming'
      
      Object.values(game.players).forEach(p => delete p.lastAction)
    },
    
    pass: (_, { game, playerId }) => {
      if (game.winner) return
      if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()
      if (game.phase !== 'claiming') throw Rune.invalidAction()
      
      game.players[playerId].lastAction = 'pass'
      
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
      game.diceValue = null
      game.phase = 'rolling'
    },

    claimEquation: (equationId, { game, playerId }) => {
      if (game.winner) return
      if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()
      if (game.phase !== 'claiming') throw Rune.invalidAction()

      const eqIndex = game.equations.findIndex(e => e.id === equationId)
      if (eqIndex === -1) throw Rune.invalidAction() 

      const eq = game.equations[eqIndex]
      if (eq.claimedBy !== null) throw Rune.invalidAction() // Equation already claimed!
      
      if (eq.result === game.diceValue) {
        // Correct match
        game.players[playerId].score += 1
        game.players[playerId].lastAction = 'hit'
        eq.claimedBy = playerId // Mark equation as claimed by this player

        // Check if all equations are claimed
        const allClaimed = game.equations.every(e => e.claimedBy !== null)
        if (allClaimed) {
            // Game over, determine winner by score
            let maxScore = -1
            let potentialWinners: PlayerId[] = []

            for (const p of game.playerIds) {
                const score = game.players[p].score
                if (score > maxScore) {
                    maxScore = score
                    potentialWinners = [p]
                } else if (score === maxScore) {
                    potentialWinners.push(p)
                }
            }

            const gameOverPlayers: Record<PlayerId, "WON" | "LOST" | "TIE"> = {}
            for (const p of game.playerIds) {
                if (potentialWinners.includes(p)) {
                    gameOverPlayers[p] = potentialWinners.length > 1 ? "TIE" : "WON"
                } else {
                    gameOverPlayers[p] = "LOST"
                }
            }
            Rune.gameOver({ players: gameOverPlayers })
            return
        }

      } else {
        // Wrong match
        game.players[playerId].lastAction = 'miss'
      }

      // Next turn (whether hit or miss)
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
      game.diceValue = null
      game.phase = 'rolling'
    },
  },
})