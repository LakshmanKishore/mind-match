import type { PlayerId, RuneClient } from "rune-sdk"

// --- Shared Types ---
export type Operator = "+" | "−" | "×" | "÷"

export interface Equation {
  id: number
  val1: number
  val2: number
  operator: Operator
  result: number
  claimedBy: PlayerId[] // List of players who claimed this (Shared in Bingo, Unique in Capture)
}

// --- Floating Mode Specifics ---
export interface FloatingEntity {
  id: number
  val1: number
  val2: number
  operator: Operator
  result: number
  x: number // 0-100%
  y: number // 0-100%
  vx: number
  vy: number
}

// --- Game State ---
export type GameScreen = "menu" | "bingo" | "capture" | "floating"

export interface PlayerState {
  score: number
  lastAction?: "hit" | "miss" | "pass"
}

export interface GameState {
  screen: GameScreen
  players: Record<PlayerId, PlayerState>
  playerIds: PlayerId[]
  
  // Shared / Bingo / Capture
  equations: Equation[] 
  diceValue: number | null
  currentPlayerIndex: number // For turn-based Bingo
  winner: PlayerId | null
  
  // Capture Specific
  nextRollAt: number 
  
  // Floating Specific
  floatingEntities: FloatingEntity[]
  nextSpawnAt: number
}

// --- Actions ---
type GameActions = {
  startGame: (mode: GameScreen) => void
  rollDice: () => void 
  claimEquation: (equationId: number) => void 
  pass: () => void 
  clickFloatingEntity: (entityId: number) => void 
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

// --- Helpers ---
function generateEquation(id: number): Equation {
  while (true) {
    const operatorIdx = Math.floor(Math.random() * 4)
    const operator = ["+", "−", "×", "÷"][operatorIdx] as Operator
    let val1 = 0, val2 = 0, result = 0

    if (operator === "+") {
      val1 = Math.floor(Math.random() * 9) + 1
      val2 = Math.floor(Math.random() * (10 - val1)) + 1
      result = val1 + val2
    } else if (operator === "−") {
      val1 = Math.floor(Math.random() * 10) + 2
      val2 = Math.floor(Math.random() * (val1 - 1)) + 1
      result = val1 - val2
    } else if (operator === "×") {
      val1 = Math.floor(Math.random() * 5) + 1
      val2 = Math.floor(Math.random() * 5) + 1
      result = val1 * val2
    } else if (operator === "÷") {
      val2 = Math.floor(Math.random() * 5) + 1
      result = Math.floor(Math.random() * 10) + 1
      val1 = result * val2
    }

    if (result >= 1 && result <= 10) {
      return { id, val1, val2, operator, result, claimedBy: [] }
    }
  }
}

function generateFloatingEntity(id: number): FloatingEntity {
  const eq = generateEquation(id)
  return {
    ...eq,
    x: Math.random() * 80 + 10,
    y: Math.random() * 80 + 10,
    vx: (Math.random() - 0.5) * 0.5, 
    vy: (Math.random() - 0.5) * 0.5
  }
}

function declareWinner(game: GameState, winnerId: PlayerId) {
  game.winner = winnerId
  const gameOverPlayers: Record<string, "WON" | "LOST"> = {}
  game.playerIds.forEach(id => {
      gameOverPlayers[id] = id === winnerId ? "WON" : "LOST"
  })
  Rune.gameOver({ players: gameOverPlayers })
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 6,
  updatesPerSecond: 30,
  setup: (allPlayerIds) => {
    const players: Record<PlayerId, PlayerState> = {}
    for (const pid of allPlayerIds) {
      players[pid] = { score: 0 }
    }
    return {
      screen: "menu",
      players,
      playerIds: allPlayerIds,
      equations: [],
      diceValue: null,
      currentPlayerIndex: 0,
      winner: null,
      nextRollAt: 0,
      floatingEntities: [],
      nextSpawnAt: 0
    }
  },
  actions: {
    startGame: (mode, { game }) => {
      if (game.screen !== "menu") throw Rune.invalidAction()
      if (!["bingo", "capture", "floating"].includes(mode)) throw Rune.invalidAction()
      
      game.screen = mode
      game.winner = null
      
      for (const pid of game.playerIds) {
        game.players[pid].score = 0
        delete game.players[pid].lastAction
      }

      if (mode === "bingo" || mode === "capture") {
        game.equations = []
        const resultCounts: Record<number, number> = {}
        let i = 0
        // Generate 12 equations with max 2 duplicates per result
        while (i < 12) { 
           const eq = generateEquation(i)
           const currentCount = resultCounts[eq.result] || 0
           
           if (currentCount < 2) {
               game.equations.push(eq)
               resultCounts[eq.result] = currentCount + 1
               i++
           }
        }
        
        if (mode === "capture") {
           game.nextRollAt = Rune.gameTime() + 1000 
           game.diceValue = null
        } else {
           game.diceValue = null
           game.currentPlayerIndex = 0
        }
      } else if (mode === "floating") {
        game.floatingEntities = []
        for (let i = 0; i < 5; i++) {
            game.floatingEntities.push(generateFloatingEntity(i))
        }
        game.nextSpawnAt = Rune.gameTime() + 2000
        game.diceValue = Math.floor(Math.random() * 10) + 1
        game.nextRollAt = Rune.gameTime() + 5000 
      }
    },

    rollDice: (_, { game, playerId }) => {
      if (game.screen !== "bingo") throw Rune.invalidAction()
      if (game.winner) return
      if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()
      if (game.diceValue !== null) throw Rune.invalidAction() 

      game.diceValue = Math.floor(Math.random() * 10) + 1
      Object.values(game.players).forEach((p) => delete p.lastAction)
    },

    pass: (_, { game, playerId }) => {
      if (game.screen !== "bingo") throw Rune.invalidAction()
      if (game.winner) return
      if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()

      game.players[playerId].lastAction = "pass"
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
      game.diceValue = null
    },

    claimEquation: (equationId, { game, playerId }) => {
      if (game.winner) return
      
      const eq = game.equations.find(e => e.id === equationId)
      if (!eq) throw Rune.invalidAction()

      // --- Mode Specific Checks ---
      if (game.screen === "bingo") {
         if (game.playerIds[game.currentPlayerIndex] !== playerId) throw Rune.invalidAction()
         // In Bingo, I cannot claim the same tile twice
         if (eq.claimedBy.includes(playerId)) throw Rune.invalidAction()
      } else if (game.screen === "capture") {
         // In Capture, once claimed by ANYONE, it's gone
         if (eq.claimedBy.length > 0) throw Rune.invalidAction()
      }

      // --- Claim Logic ---
      if (game.diceValue !== null && eq.result === game.diceValue) {
        // HIT
        eq.claimedBy.push(playerId)
        game.players[playerId].score += 1
        game.players[playerId].lastAction = "hit"
        
        if (game.screen === "bingo") {
           // Turn End
           game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
           game.diceValue = null
           // Win Check: Must claim ALL equations (clear the board)
           if (game.players[playerId].score >= game.equations.length) {
               declareWinner(game, playerId)
           }
        } else if (game.screen === "capture") {
           // Win Check: Board Full
           const allClaimed = game.equations.every(e => e.claimedBy.length > 0)
           if (allClaimed) {
             let maxScore = -1
             let winner: PlayerId | null = null
             game.playerIds.forEach(pid => {
               if (game.players[pid].score > maxScore) {
                 maxScore = game.players[pid].score
                 winner = pid
               }
             })
             if (winner) declareWinner(game, winner)
           }
        }
      } else {
         // MISS
         game.players[playerId].lastAction = "miss"
         if (game.screen === "bingo") {
            // Turn End on Miss too
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.playerIds.length
            game.diceValue = null
         }
      }
    },

    clickFloatingEntity: (entityId, { game, playerId }) => {
      if (game.screen !== "floating") throw Rune.invalidAction()
      if (game.winner) return

      const idx = game.floatingEntities.findIndex(e => e.id === entityId)
      if (idx === -1) throw Rune.invalidAction()
      const ent = game.floatingEntities[idx]

      if (game.diceValue !== null && ent.result === game.diceValue) {
        // HIT
        game.floatingEntities.splice(idx, 1)
        game.players[playerId].score += 1
        game.players[playerId].lastAction = "hit"

        if (game.players[playerId].score >= 20) {
          declareWinner(game, playerId)
        }
      } else {
        // MISS
        game.players[playerId].lastAction = "miss"
      }
    }
  },
  update: ({ game }) => {
    // --- Capture Auto-Roll ---
    if (game.screen === "capture" && !game.winner) {
      if (Rune.gameTime() >= game.nextRollAt) {
        game.diceValue = Math.floor(Math.random() * 10) + 1
        game.nextRollAt = Rune.gameTime() + 20000 
        Object.values(game.players).forEach(p => delete p.lastAction)
      }
    }

    // --- Floating Physics ---
    if (game.screen === "floating" && !game.winner) {
      // Spawn
      if (Rune.gameTime() >= game.nextSpawnAt && game.floatingEntities.length < 15) {
        game.floatingEntities.push(generateFloatingEntity(Math.floor(Math.random() * 100000)))
        game.nextSpawnAt = Rune.gameTime() + 2000 
      }
      // Target
      if (Rune.gameTime() >= game.nextRollAt) {
        game.diceValue = Math.floor(Math.random() * 10) + 1
        game.nextRollAt = Rune.gameTime() + 8000 
      }
      // Physics
      const entities = game.floatingEntities
      for (let i = 0; i < entities.length; i++) {
        const ent = entities[i]
        ent.x += ent.vx
        ent.y += ent.vy
        
        // Walls
        if (ent.x <= 5 || ent.x >= 90) ent.vx *= -1
        if (ent.y <= 5 || ent.y >= 90) ent.vy *= -1

        // Collisions
        for (let j = i + 1; j < entities.length; j++) {
          const other = entities[j]
          const dx = ent.x - other.x
          const dy = ent.y - other.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const minDist = 12 

          if (dist < minDist) {
            const tempVx = ent.vx, tempVy = ent.vy
            ent.vx = other.vx; ent.vy = other.vy
            other.vx = tempVx; other.vy = tempVy
            
            const angle = Math.atan2(dy, dx)
            const overlap = minDist - dist
            const pushX = Math.cos(angle) * overlap * 0.5
            const pushY = Math.sin(angle) * overlap * 0.5
            ent.x += pushX; ent.y += pushY
            other.x -= pushX; other.y -= pushY
          }
        }
      }
    }
  },
  events: {
    playerJoined: (playerId, { game }) => {
      if (!game.players[playerId]) {
        game.players[playerId] = { score: 0 }
      }
      if (!game.playerIds.includes(playerId)) {
        game.playerIds.push(playerId)
      }
    },
    playerLeft: (playerId, { game }) => {
      const index = game.playerIds.indexOf(playerId)
      if (index !== -1) {
        game.playerIds.splice(index, 1)
        if (game.playerIds.length > 0) {
           game.currentPlayerIndex = game.currentPlayerIndex % game.playerIds.length
        } else {
           game.currentPlayerIndex = 0
        }
      }
      // Cleanup
      game.equations.forEach(eq => {
          const idx = eq.claimedBy.indexOf(playerId)
          if (idx !== -1) eq.claimedBy.splice(idx, 1)
      })
      delete game.players[playerId]
    }
  },
})
