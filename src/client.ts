import "./styles.css"
import { PlayerId } from "rune-sdk"
import { GameState, GameScreen, FloatingEntity } from "./logic.ts"

// --- Global State ---
const root = document.querySelector("main") || document.body
let currentScreen: GameScreen | null = null
let rollAnimationId: number | null = null
let lastDiceVal: number | null = null

// DOM Cache for performance
const floatingDomCache: Record<number, HTMLDivElement> = {}

// --- Helpers ---
function getPlayerName(playerId: PlayerId) {
  const p = Rune.getPlayerInfo(playerId)
  return p.displayName || "Player"
}

// --- Component Generators ---

function getHeaderHtml(game: GameState, yourPlayerId: PlayerId | undefined) {
  const diceVal = game.diceValue === null ? "?" : game.diceValue
  const currentPlayer = game.playerIds[game.currentPlayerIndex]
  const isMyTurn = currentPlayer === yourPlayerId
  
  let statusText = ""
  if (game.winner) {
    statusText = `${getPlayerName(game.winner)} Wins!`
  } else if (game.screen === "bingo") {
     if (game.diceValue === null) statusText = isMyTurn ? "Your Turn: Roll!" : `${getPlayerName(currentPlayer)} rolling...`
     else statusText = isMyTurn ? `Match ${diceVal}` : `${getPlayerName(currentPlayer)} choosing...`
  } else if (game.screen === "capture") {
     statusText = game.diceValue ? `Match ${diceVal}!` : "Wait for roll..."
  } else if (game.screen === "floating") {
     statusText = game.diceValue ? `Pop ${diceVal}!` : "Get ready..."
  }

  return `
    <div class="game-header">
      <div id="dice-display">${diceVal}</div>
      <div id="status-text">${statusText}</div>
    </div>
  `
}

function getPlayersHtml(game: GameState) {
  return `
    <div id="players-row">
      ${game.playerIds.map(pid => {
        const pState = game.players[pid]
        const info = Rune.getPlayerInfo(pid)
        const isTurn = game.screen === "bingo" && game.playerIds[game.currentPlayerIndex] === pid
        
        let score = pState.score.toString()
        // If Bingo, display score out of total equations
        if(game.screen === "bingo" && game.equations.length > 0) score += `/${game.equations.length}`
        
        let badge = ""
        if(pState.lastAction === "hit") badge = `<span class="badge hit">✓</span>`
        else if(pState.lastAction === "miss") badge = `<span class="badge miss">✗</span>`
        else if(pState.lastAction === "pass") badge = `<span class="badge pass">−</span>`

        return `
          <div class="player-seat ${isTurn ? "turn-active" : ""}">
            <div class="avatar-wrapper">
              <img src="${info.avatarUrl}" />
              ${badge}
            </div>
            <div class="p-name">${info.displayName}</div>
            <div class="p-score">${score}</div>
          </div>
        `
      }).join("")}
    </div>
  `
}

// --- Menu Render ---
function renderMenu() {
  if (currentScreen === "menu") return // Static
  root.innerHTML = `
    <div class="menu-screen">
      <h1>Mind Match</h1>
      <button class="menu-btn" data-mode="bingo">Play Bingo</button>
      <button class="menu-btn" data-mode="capture">Play Capture</button>
      <button class="menu-btn" data-mode="floating">Play Floating</button>
    </div>
  `
  document.querySelectorAll(".menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      Rune.actions.startGame((e.target as HTMLElement).dataset.mode as GameScreen)
    })
  })
}

// --- Bingo Render (Isolated) ---
function renderBingo(game: GameState, yourPlayerId: PlayerId | undefined) {
  // 1. Setup Layout if needed
  if (currentScreen !== "bingo") {
    root.innerHTML = `
      <div class="layout-bingo">
        <div id="header-container"></div>
        <div id="grid-container" class="grid-container"></div>
        <div class="game-footer">
          <div id="players-container"></div>
          <div id="controls-row"></div>
        </div>
      </div>
    `
  }

  // 2. Update Header & Players
  document.getElementById("header-container")!.innerHTML = getHeaderHtml(game, yourPlayerId)
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  // 3. Update Grid
  const grid = document.getElementById("grid-container")!
  const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
  const canClaim = game.diceValue !== null

  grid.innerHTML = game.equations.map(eq => {
    const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
    // Bingo Rule: I can claim if I haven't yet.
    const isDisabled = iHaveClaimed
    
    let cls = "equation-card"
    if (iHaveClaimed) cls += " claimed-by-me"
    if (isDisabled) cls += " claimed-disabled"
    if (isMyTurn && canClaim && !isDisabled) cls += " interactive"

    return `
      <div class="${cls}" data-id="${eq.id}">
        <span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>
        <div class="avatars-container">
          ${eq.claimedBy.map(pid => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
  }).join("")

  grid.querySelectorAll(".interactive").forEach(el => {
    el.addEventListener("click", () => Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!)))
  })

  // 4. Update Controls
  const controls = document.getElementById("controls-row")!
  if (game.winner) {
    controls.innerHTML = `<div class="msg">Game Over!</div>`
  } else if (isMyTurn) {
    if (game.diceValue === null) {
      if (!document.getElementById("rollBtn")) {
        controls.innerHTML = `<button id="rollBtn" class="action-btn primary">Roll Dice</button>`
        document.getElementById("rollBtn")!.addEventListener("click", () => Rune.actions.rollDice())
      }
    } else {
       if (!document.getElementById("passBtn")) {
        controls.innerHTML = `<button id="passBtn" class="action-btn secondary">Pass</button>`
        document.getElementById("passBtn")!.addEventListener("click", () => Rune.actions.pass())
      }
    }
  } else {
    controls.innerHTML = `<div class="msg">Waiting for opponent...</div>`
  }

  handleDiceAnim(game.diceValue)
}

// --- Capture Render (Isolated) ---
function renderCapture(game: GameState, yourPlayerId: PlayerId | undefined) {
  if (currentScreen !== "capture") {
    root.innerHTML = `
      <div class="layout-capture">
        <div id="header-container"></div>
        <div id="grid-container" class="grid-container"></div>
        <div class="game-footer">
          <div id="players-container"></div>
          <div id="controls-row"><div class="msg">Race to match!</div></div>
        </div>
      </div>
    `
  }

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(game, yourPlayerId)
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const grid = document.getElementById("grid-container")!
  grid.innerHTML = game.equations.map(eq => {
    const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
    const claimedByOthers = eq.claimedBy.length > 0
    const canClick = game.diceValue !== null && !claimedByOthers

    let cls = "equation-card"
    if (iHaveClaimed) cls += " claimed-by-me"
    if (claimedByOthers && !iHaveClaimed) cls += " claimed-disabled"
    if (canClick) cls += " interactive"

    return `
      <div class="${cls}" data-id="${eq.id}">
        <span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>
        <div class="avatars-container">
           ${eq.claimedBy.map(pid => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
  }).join("")

  grid.querySelectorAll(".interactive").forEach(el => {
    el.addEventListener("click", () => Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!)))
  })

  handleDiceAnim(game.diceValue)
}

// --- Floating Render (Isolated) ---
function renderFloating(game: GameState, yourPlayerId: PlayerId | undefined) {
  if (currentScreen !== "floating") {
    // Clear DOM cache when entering floating mode to be safe
    for(const k in floatingDomCache) delete floatingDomCache[k]
    
    root.innerHTML = `
      <div class="layout-floating">
        <div id="header-container"></div>
        <div id="floating-container" class="floating-container"></div>
        <div class="game-footer">
          <div id="players-container"></div>
        </div>
      </div>
    `
  }

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(game, yourPlayerId)
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const container = document.getElementById("floating-container")!
  const updatedIds = new Set<number>()

  // Debug: If no entities, show message
  if (!game.floatingEntities || game.floatingEntities.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color: #888;">No floating entities? (Debug: Array is empty)</div>`
    // Clear existing DOM bubbles if any, as we're showing empty state
    for (const k in floatingDomCache) {
      floatingDomCache[k].remove()
      delete floatingDomCache[k]
    }
  } else {
      // Clear debug message if entities now exist
      if(container.innerHTML.includes("No floating entities?")) container.innerHTML = "";

      game.floatingEntities.forEach(ent => {
        updatedIds.add(ent.id)
        let el = floatingDomCache[ent.id]
        if (!el) {
          el = document.createElement("div")
          el.className = "floating-entity"
          el.innerHTML = `<span>${ent.val1} ${ent.operator} ${ent.val2}</span>`
          el.addEventListener("click", () => Rune.actions.clickFloatingEntity(ent.id))
          container.appendChild(el)
          floatingDomCache[ent.id] = el
        }
        el.style.left = `${ent.x}%`
        el.style.top = `${ent.y}%`
      })

      // Cleanup
      for (const k in floatingDomCache) {
        if (!updatedIds.has(parseInt(k))) {
          floatingDomCache[k].remove()
          delete floatingDomCache[k]
        }
      }
  }

  handleDiceAnim(game.diceValue)
}

// --- Shared Animation Logic ---
function handleDiceAnim(val: number | null) {
  const el = document.getElementById("dice-display")
  if (!el) return

  if (val !== null && val !== lastDiceVal) {
    if (!rollAnimationId) {
      let steps = 0
      rollAnimationId = window.setInterval(() => {
        steps++
        el.textContent = (Math.floor(Math.random() * 10) + 1).toString()
        if (steps >= 12) {
          clearInterval(rollAnimationId!)
          rollAnimationId = null
          el.textContent = val.toString()
          el.classList.remove("pop")
          void el.offsetWidth
          el.classList.add("pop")
        }
      }, 50)
    }
  } else if (val === null) {
     if (rollAnimationId) { clearInterval(rollAnimationId); rollAnimationId = null }
     el.textContent = "?"
     el.classList.remove("pop")
  }
  lastDiceVal = val
}

// --- Main Init ---
Rune.initClient({
  onChange: ({ game, yourPlayerId }) => {
    // 1. Check if screen changed to handle cleanup (clearing cache)
    if (game.screen !== currentScreen) {
      // Clear all floating cache on screen change.
      for(const k in floatingDomCache) delete floatingDomCache[k]
    }
    
    // 2. Dispatch to appropriate renderer (currentScreen is still OLD value here, so layout builds)
    if (game.screen === "menu") renderMenu()
    else if (game.screen === "bingo") renderBingo(game, yourPlayerId)
    else if (game.screen === "capture") renderCapture(game, yourPlayerId)
    else if (game.screen === "floating") renderFloating(game, yourPlayerId)

    // 3. Update currentScreen to new value
    currentScreen = game.screen

    // Theme Toggle persistence (Optional, kept simple)
    if (!document.getElementById("theme-toggle")) {
      const t = document.createElement("button")
      t.id = "theme-toggle"
      t.style.position = "absolute"; t.style.top = "10px"; t.style.right = "10px";
      t.style.zIndex = "50"; t.style.background = "none"; t.style.border = "none";
      t.style.fontSize = "1.5rem"; t.style.cursor = "pointer";
      t.textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙"
      root.appendChild(t) // Append to root (main) so it sits on top
      t.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode")
        t.textContent = document.body.classList.contains("dark-mode") ? "☀️" : "🌙"
      })
    }
  },
})