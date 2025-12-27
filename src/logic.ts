import type { PlayerId, RuneClient } from "rune-sdk"

export type Operator = '+' | '−' | '×' | '÷'

export interface Equation {
  id: number
  val1: number
  val2: number
  operator: Operator
  result: number
  claimedBy: PlayerId[] // List of all players who have claimed this equation
}

export interface PlayerState {
  score: number
  lastAction?: 'hit' | 'miss' | 'pass'
}

export interface GameState {
  equations: Equation[] // Static board
  diceValue: number | null
  players: Record<PlayerId, PlayerState>
  currentPlayerIndex: number
  playerIds: PlayerId[] // Keep track of active players in order
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
      return { id, val1, val2, operator, result, claimedBy: [] }
    }
  }
}

Rune.initLogic({
  minPlayers: 1,
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
      
      // Shared Completion:
      // Invalid if *I* have already claimed it.
      if (eq.claimedBy.includes(playerId)) throw Rune.invalidAction()
      
      if (eq.result === game.diceValue) {
        // Correct match
        game.players[playerId].score += 1
        game.players[playerId].lastAction = 'hit'
        eq.claimedBy.push(playerId) // Append player to the list of claimers

        // Check Win: First player to reach 10 points wins (meaning they claimed all 10 unique equations)
        // Since we prevent double claiming, score 10 = all 10 equations.
        if (game.players[playerId].score >= 10) {
          game.winner = playerId
          Rune.gameOver({
            players: {
              [playerId]: "WON",
              ...Object.fromEntries(game.playerIds.filter(p => p !== playerId).map(p => [p, "LOST"]))
            }
          })
          return
        }

      } else {
        // Wrong match
        game.players[playerId].lastAction = 'miss'
      }

      // Next turn
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
      game.diceValue = null
      game.phase = 'rolling'
    },
  },
  events: {
    playerJoined: (playerId, { game }) => {
      if (!game.players[playerId]) {
        game.players[playerId] = { score: 0 };
      }
      if (!game.playerIds.includes(playerId)) {
        game.playerIds.push(playerId);
      }
    },
    playerLeft: (playerId, { game }) => {
      const index = game.playerIds.indexOf(playerId);
      if (index !== -1) {
        game.playerIds.splice(index, 1);
        if (game.playerIds.length > 0) {
          game.currentPlayerIndex = game.currentPlayerIndex % game.playerIds.length;
        } else {
          game.currentPlayerIndex = 0; 
        }
      }

      // Remove player from all claimed lists
      game.equations.forEach(eq => {
        const pIdx = eq.claimedBy.indexOf(playerId)
        if (pIdx !== -1) {
          eq.claimedBy.splice(pIdx, 1)
        }
      });

      delete game.players[playerId];
    },
  },
})