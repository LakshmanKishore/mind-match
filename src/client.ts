import "./styles.css"
import { PlayerId } from "rune-sdk"
import { GameState, GameScreen, FloatingEntity } from "./logic.ts"

// --- Global Elements ---
const root = document.querySelector("main") || document.body
root.innerHTML = `<div id="game-container"></div>`
const gameContainer = document.getElementById("game-container")!

// --- State Cache ---
let currentScreen: GameScreen | null = null
let rollAnimationId: number | null = null
let lastDiceVal: number | null = null
// Cache for floating entities to avoid destroying DOM elements
const floatingDomCache: Record<number, HTMLDivElement> = {}

// --- Helpers ---
function getPlayerName(playerId: PlayerId) {
  const p = Rune.getPlayerInfo(playerId)
  return p.displayName || "Player"
}

// --- View Setup (Called once per screen switch) ---

function setupMenu() {
  gameContainer.innerHTML = `
    <div class="menu-screen">
      <h1>Mind Match</h1>
      <button class="menu-btn" data-mode="bingo">Play Bingo</button>
      <button class="menu-btn" data-mode="capture">Play Capture</button>
      <button class="menu-btn" data-mode="floating">Play Floating Equations</button>
    </div>
  `
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const mode = (e.target as HTMLElement).dataset.mode as GameScreen
      Rune.actions.startGame(mode)
    })
  })
}

function setupGameLayout(mode: GameScreen) {
  // Common layout skeleton for all game modes
  gameContainer.innerHTML = `
    <div id="header">
      <div id="dice-display">?</div>
      <div id="status-text"></div>
    </div>
    <div id="game-board" class="${mode}-board"></div>
    <div id="footer">
      <div id="players-row"></div>
      <div id="controls-row"></div>
    </div>
  `
}

// --- Update Functions (Called every change) ---

function updateHeader(game: GameState, yourPlayerId: PlayerId | undefined) {
  const diceEl = document.getElementById("dice-display")!
  const statusEl = document.getElementById("status-text")!
  const currentVal = game.diceValue
  const currentPlayer = game.playerIds[game.currentPlayerIndex]
  const isMyTurn = currentPlayer === yourPlayerId

  // --- Dice Animation Logic ---
  if (currentVal !== null && currentVal !== lastDiceVal) {
    // Start animation if new value
    if (!rollAnimationId) {
      diceEl.classList.add("active")
      let steps = 0
      rollAnimationId = window.setInterval(() => {
        steps++
        diceEl.textContent = (Math.floor(Math.random() * 10) + 1).toString()
        if (steps >= 12) {
          if (rollAnimationId) clearInterval(rollAnimationId)
          rollAnimationId = null
          diceEl.textContent = currentVal.toString()
          diceEl.classList.remove("pop")
          void diceEl.offsetWidth // Trigger reflow
          diceEl.classList.add("pop")
        }
      }, 50)
    }
  } else if (currentVal === null) {
    // Reset
    if (rollAnimationId) {
      clearInterval(rollAnimationId)
      rollAnimationId = null
    }
    diceEl.textContent = "?"
    diceEl.classList.remove("pop")
    diceEl.classList.remove("active")
  }
  lastDiceVal = currentVal

  // --- Status Text ---
  let statusText = ""
  if (game.winner) {
    statusText = `${getPlayerName(game.winner)} wins!`
  } else if (game.screen === "bingo") {
    if (game.diceValue === null) {
      statusText = isMyTurn ? "Your Turn: Roll the Dice!" : `${getPlayerName(currentPlayer)} is rolling...`
    } else {
      statusText = isMyTurn ? `Choose matching equation for ${game.diceValue}` : `${getPlayerName(currentPlayer)} is choosing...`
    }
  } else if (game.screen === "capture") {
    statusText = game.diceValue ? `Match ${game.diceValue}! Quick!` : "Wait for roll..."
  } else if (game.screen === "floating") {
    statusText = game.diceValue ? `Pop bubbles equaling ${game.diceValue}!` : "Get ready..."
  }
  statusEl.textContent = statusText
}

function updatePlayers(game: GameState) {
  const playersRow = document.getElementById("players-row")!
  
  // We rebuild players list as it's cheap and infrequent changes (score/turn)
  let html = ""
  game.playerIds.forEach((pid) => {
    const isTurn = game.screen === "bingo" && game.playerIds[game.currentPlayerIndex] === pid
    const pState = game.players[pid]
    const info = Rune.getPlayerInfo(pid)
    
    let scoreText = ""
    if (game.screen === "bingo") scoreText = `${pState.score}/${game.equations.length}`
    else if (game.screen === "capture") scoreText = `${pState.score}`
    else if (game.screen === "floating") scoreText = `${pState.score}`

    let statusBadge = ""
    if (pState.lastAction === "hit") statusBadge = '<span class="badge hit">✓</span>'
    else if (pState.lastAction === "miss") statusBadge = '<span class="badge miss">✗</span>'
    else if (pState.lastAction === "pass") statusBadge = '<span class="badge pass">−</span>'

    html += `
      <div class="player-seat ${isTurn ? "turn-active" : ""}">
        <div class="avatar-wrapper">
          <img src="${info.avatarUrl}" alt="${info.displayName}"/>
          ${statusBadge}
        </div>
        <div class="p-name">${info.displayName}</div>
        <div class="p-score">${scoreText}</div>
      </div>
    `
  })
  playersRow.innerHTML = html
}

function updateBingoBoard(game: GameState, yourPlayerId: PlayerId | undefined) {
  const board = document.getElementById("game-board")!
  const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
  const canClaim = game.diceValue !== null

  // Rebuild grid content (safe for Bingo as it's not high frequency)
  board.className = "bingo-grid" 
  board.innerHTML = game.equations.map(eq => {
    const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
    // In Bingo, others claiming doesn't matter. Only disable if I claimed it.
    const claimedByOthers = game.screen === "capture" && eq.claimedBy.length > 0 && !iHaveClaimed
    const isDisabled = claimedByOthers || iHaveClaimed
    
    let classes = "equation-card"
    if (iHaveClaimed) classes += " claimed-by-me"
    if (isDisabled) classes += " claimed-disabled"
    if (isMyTurn && canClaim && !isDisabled) classes += " interactive"

    return `
      <div class="${classes}" data-id="${eq.id}">
        <span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>
        <div class="avatars-container">
           ${eq.claimedBy.map(pid => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
  }).join("")

  // Bind clicks
  board.querySelectorAll(".interactive").forEach(el => {
    el.addEventListener("click", () => {
      Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!))
    })
  })
}

function updateCaptureBoard(game: GameState, yourPlayerId: PlayerId | undefined) {
  const board = document.getElementById("game-board")!
  // Capture is similar to Bingo but different interactivity rules
  board.className = "capture-grid"
  
  board.innerHTML = game.equations.map(eq => {
    const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
    const claimedByOthers = eq.claimedBy.length > 0
    const canClick = game.diceValue !== null && !claimedByOthers

    let classes = "equation-card"
    if (iHaveClaimed) classes += " claimed-by-me"
    if (claimedByOthers && !iHaveClaimed) classes += " claimed-disabled"
    if (canClick) classes += " interactive"

    return `
      <div class="${classes}" data-id="${eq.id}">
        <span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>
         <div class="avatars-container">
           ${eq.claimedBy.map(pid => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
  }).join("")

  board.querySelectorAll(".interactive").forEach(el => {
    el.addEventListener("click", () => {
      Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!))
    })
  })
}

function updateFloatingBoard(game: GameState, yourPlayerId: PlayerId | undefined) {
  const board = document.getElementById("game-board")!
  board.className = "floating-area" 

  if (!game.floatingEntities || game.floatingEntities.length === 0) {
    board.innerHTML = `<div style="padding:20px; text-align:center; color: #888;">No floating entities? (Debug: Array is empty)</div>`
    return
  }

  // 1. Mark all as not updated
  const updatedIds = new Set<number>()

  // 2. Update or Create entities
  game.floatingEntities.forEach(ent => {
    updatedIds.add(ent.id)
    
    let el = floatingDomCache[ent.id]
    if (!el) {
      // Create new
      el = document.createElement("div")
      el.className = "floating-entity"
      el.innerHTML = `<span class="eq-math">${ent.val1} ${ent.operator} ${ent.val2}</span>`
      el.addEventListener("click", () => Rune.actions.clickFloatingEntity(ent.id))
      board.appendChild(el)
      floatingDomCache[ent.id] = el
    }

    // Update position (High perf)
    el.style.left = `${ent.x}%`
    el.style.top = `${ent.y}%`
  })

  // 3. Remove stale entities
  Object.keys(floatingDomCache).forEach(key => {
    const id = parseInt(key)
    if (!updatedIds.has(id)) {
      floatingDomCache[id].remove()
      delete floatingDomCache[id]
    }
  })
}

function updateControls(game: GameState, yourPlayerId: PlayerId | undefined) {
  const controlsRow = document.getElementById("controls-row")!
  
  if (game.winner) {
    controlsRow.innerHTML = `<div class="msg">Game Over!</div>`
    return
  }

  // --- Bingo Controls ---
  if (game.screen === "bingo") {
    const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
    
    if (isMyTurn) {
      if (game.diceValue === null) {
        // Show Roll Button
        if (!document.getElementById("rollBtn")) {
          controlsRow.innerHTML = `<button id="rollBtn" class="action-btn primary">Roll Dice</button>`
          document.getElementById("rollBtn")!.addEventListener("click", () => Rune.actions.rollDice())
        }
      } else {
        // Show Pass Button
        if (!document.getElementById("passBtn")) {
          controlsRow.innerHTML = `<button id="passBtn" class="action-btn secondary">Pass</button>`
          document.getElementById("passBtn")!.addEventListener("click", () => Rune.actions.pass())
        }
      }
    } else {
      controlsRow.innerHTML = `<div class="msg">Waiting for opponent...</div>`
    }
  } 
  // --- Capture Controls ---
  else if (game.screen === "capture") {
    controlsRow.innerHTML = `<div class="msg">Race to match!</div>`
  }
}

// --- Main Loop ---

Rune.initClient({
  onChange: ({ game, yourPlayerId }) => {
    // 1. Screen Switching Logic
    if (game.screen !== currentScreen) {
      currentScreen = game.screen
      if (game.screen === "menu") {
        setupMenu()
      } else {
        setupGameLayout(game.screen)
      }
      // Clear cache on screen switch
      Object.keys(floatingDomCache).forEach(k => delete floatingDomCache[parseInt(k)])
    }

    // 2. Update Content based on screen
    if (game.screen === "menu") return

    updateHeader(game, yourPlayerId)
    updatePlayers(game)
    updateControls(game, yourPlayerId)

    if (game.screen === "bingo") {
      updateBingoBoard(game, yourPlayerId)
    } else if (game.screen === "capture") {
      updateCaptureBoard(game, yourPlayerId)
    } else if (game.screen === "floating") {
      updateFloatingBoard(game, yourPlayerId)
    }

    // Theme Toggle persistence check
    if (!document.getElementById("theme-toggle")) {
      const t = document.createElement("button")
      t.id = "theme-toggle"
      t.textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙"
      root.prepend(t)
      t.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode")
        t.textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙"
      })
    }
  },
})