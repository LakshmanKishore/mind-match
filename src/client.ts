import "./styles.css"
import { PlayerId } from "rune-sdk"
import { GameState, GameScreen } from "./logic.ts"

// --- Global State ---
const root = document.querySelector("main") || document.body
let currentScreen: GameScreen | null = null
let rollAnimationId: number | null = null
let lastDiceVal: number | null = null
let matrixAnimationId: number | null = null

// DOM Cache for performance
const floatingDomCache: Record<number, HTMLDivElement> = {}

// --- Helpers ---
function getPlayerName(playerId: PlayerId) {
  const p = Rune.getPlayerInfo(playerId)
  return p.displayName || "Player"
}

// --- Component Generators ---

function getHeaderHtml(game: GameState, yourPlayerId: PlayerId | undefined) {
  let diceVal: string | number = game.diceValue === null ? "?" : game.diceValue

  if (game.screen === "sumGrid") {
    diceVal = game.sumGridTarget === null ? "?" : game.sumGridTarget
  }

  const currentPlayer = game.playerIds[game.currentPlayerIndex]
  const isMyTurn = currentPlayer === yourPlayerId

  let statusText = ""
  let extraHtml = ""

  if (game.winner) {
    statusText = `${getPlayerName(game.winner)} Wins!`
  } else if (game.screen === "bingo") {
    if (game.diceValue === null)
      statusText = isMyTurn
        ? "Your Turn: Roll!"
        : `${getPlayerName(currentPlayer)} rolling...`
    else
      statusText = isMyTurn
        ? `Match ${diceVal}`
        : `${getPlayerName(currentPlayer)} choosing...`
  } else if (game.screen === "capture") {
    statusText = game.diceValue ? `Match ${diceVal}!` : "Wait for roll..."
    // Add Timer Bar for Capture Mode
    extraHtml = `<div class="timer-bar-container"><div id="timer-bar" class="timer-bar"></div></div>`
  } else if (game.screen === "floating") {
    statusText = game.diceValue ? `Pop ${diceVal}!` : "Get ready..."
    extraHtml = `<div class="timer-bar-container"><div id="timer-bar" class="timer-bar"></div></div>`
  } else if (game.screen === "sumGrid") {
    statusText = game.sumGridTarget ? `Sum to ${diceVal}!` : "Loading..."
    extraHtml = `<div class="timer-bar-container"><div id="timer-bar" class="timer-bar"></div></div>`
  }

  return `
    <div class="game-header">
      <div id="dice-display">${diceVal}</div>
      <div id="status-text">${statusText}</div>
      ${extraHtml}
    </div>
  `
}

function getPlayersHtml(game: GameState) {
  return `
    <div id="players-row">
      ${game.playerIds
        .map((pid) => {
          const pState = game.players[pid]
          const info = Rune.getPlayerInfo(pid)
          const isTurn =
            game.screen === "bingo" &&
            game.playerIds[game.currentPlayerIndex] === pid

          let score = pState.score.toString()
          // If Bingo, display score out of total equations
          if (game.screen === "bingo" && game.equations.length > 0)
            score += `/${game.equations.length}`

          let badge = ""
          if (pState.lastAction === "hit")
            badge = `<span class="badge hit">✓</span>`
          else if (pState.lastAction === "miss")
            badge = `<span class="badge miss">✗</span>`
          else if (pState.lastAction === "pass")
            badge = `<span class="badge pass">−</span>`

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
        })
        .join("")}
    </div>
  `
}

// --- Menu Render ---
function renderMenu() {
  if (currentScreen === "menu") return // Static
  root.innerHTML = `
    <canvas id="matrix-bg"></canvas>
    <div class="menu-screen" style="position: relative; z-index: 2;">
      <h1>Mind Match</h1>
      <button class="menu-btn" data-mode="bingo">Play Bingo</button>
      <button class="menu-btn" data-mode="capture">Play Capture</button>
      <button class="menu-btn" data-mode="floating">Play Floating</button>
      <button class="menu-btn" data-mode="sumGrid">Play Sum Grid</button>
    </div>
  `
  document.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      Rune.actions.startGame(
        (e.target as HTMLElement).dataset.mode as GameScreen
      )
    })
  })

  // Matrix Effect
  const canvas = document.getElementById("matrix-bg") as HTMLCanvasElement
  const ctx = canvas.getContext("2d")
  if (!ctx) return

  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const fontSize = 14
  const columns = canvas.width / fontSize
  const drops: number[] = []
  for (let x = 0; x < columns; x++) drops[x] = 1

  function drawMatrix() {
    if (!ctx) return
    // Translucent black to show trail
    ctx.fillStyle = "rgba(244, 245, 247, 0.1)" // Light theme bg match but transparent
    if (document.body.classList.contains("dark-mode")) {
      ctx.fillStyle = "rgba(18, 18, 18, 0.1)"
    }

    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = "#4e54c8" // Primary color
    ctx.font = fontSize + "px monospace"

    for (let i = 0; i < drops.length; i++) {
      const text = Math.floor(Math.random() * 10).toString()
      ctx.fillText(text, i * fontSize, drops[i] * fontSize)

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0
      }
      drops[i]++
    }
    matrixAnimationId = requestAnimationFrame(drawMatrix)
  }

  drawMatrix()
}

// --- Bingo Render (Isolated) ---
function renderBingo(game: GameState, yourPlayerId: PlayerId | undefined) {
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

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(
    game,
    yourPlayerId
  )
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const grid = document.getElementById("grid-container")!
  const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
  const canClaim = game.diceValue !== null

  grid.innerHTML = game.equations
    .map((eq) => {
      const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
      const isDisabled = iHaveClaimed

      let cls = "equation-card"
      if (iHaveClaimed) cls += " claimed-by-me"
      if (isDisabled) cls += " claimed-disabled"
      if (isMyTurn && canClaim && !isDisabled) cls += " interactive"

      return `
      <div class="${cls}" data-id="${eq.id}">
        <span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>
        <div class="avatars-container">
          ${eq.claimedBy.map((pid) => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
    })
    .join("")

  grid.querySelectorAll(".interactive").forEach((el) => {
    el.addEventListener("click", () =>
      Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!))
    )
  })

  const controls = document.getElementById("controls-row")!
  if (game.winner) {
    controls.innerHTML = `<div class="msg">Game Over!</div>`
  } else if (isMyTurn) {
    if (game.diceValue === null) {
      if (!document.getElementById("rollBtn")) {
        controls.innerHTML = `<button id="rollBtn" class="action-btn primary">Roll Dice</button>`
        document
          .getElementById("rollBtn")!
          .addEventListener("click", () => Rune.actions.rollDice())
      }
    } else {
      if (!document.getElementById("passBtn")) {
        controls.innerHTML = `<button id="passBtn" class="action-btn secondary">Pass</button>`
        document
          .getElementById("passBtn")!
          .addEventListener("click", () => Rune.actions.pass())
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

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(
    game,
    yourPlayerId
  )
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const grid = document.getElementById("grid-container")!
  grid.innerHTML = game.equations
    .map((eq) => {
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
           ${eq.claimedBy.map((pid) => `<img src="${Rune.getPlayerInfo(pid).avatarUrl}" class="mini-avatar"/>`).join("")}
        </div>
      </div>
    `
    })
    .join("")

  grid.querySelectorAll(".interactive").forEach((el) => {
    el.addEventListener("click", () =>
      Rune.actions.claimEquation(parseInt((el as HTMLElement).dataset.id!))
    )
  })

  handleDiceAnim(game.diceValue)
  handleTimerBar(game)
}

// --- Floating Render (Isolated) ---
function renderFloating(game: GameState, yourPlayerId: PlayerId | undefined) {
  if (currentScreen !== "floating") {
    for (const k in floatingDomCache) delete floatingDomCache[k]

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

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(
    game,
    yourPlayerId
  )
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const container = document.getElementById("floating-container")!
  const updatedIds = new Set<number>()

  if (!game.floatingEntities || game.floatingEntities.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color: #888;">No floating entities? (Debug: Array is empty)</div>`
    for (const k in floatingDomCache) {
      floatingDomCache[k].remove()
      delete floatingDomCache[k]
    }
  } else {
    if (container.innerHTML.includes("No floating entities?"))
      container.innerHTML = ""

    game.floatingEntities.forEach((ent) => {
      updatedIds.add(ent.id)
      let el = floatingDomCache[ent.id]
      if (!el) {
        el = document.createElement("div")
        el.className = "floating-entity"
        el.innerHTML = `<span>${ent.val1} ${ent.operator} ${ent.val2}</span>`
        el.addEventListener("click", () =>
          Rune.actions.clickFloatingEntity(ent.id)
        )
        container.appendChild(el)
        floatingDomCache[ent.id] = el
      }
      el.style.left = `${ent.x}%`
      el.style.top = `${ent.y}%`
    })

    for (const k in floatingDomCache) {
      if (!updatedIds.has(parseInt(k))) {
        floatingDomCache[k].remove()
        delete floatingDomCache[k]
      }
    }
  }

  handleDiceAnim(game.diceValue)
  handleTimerBar(game)
}

// --- Sum Grid Render (Isolated) ---
function renderSumGrid(game: GameState, yourPlayerId: PlayerId | undefined) {
  if (currentScreen !== "sumGrid") {
    root.innerHTML = `
      <div class="layout-sum-grid">
        <div id="header-container"></div>
        <div id="grid-container" class="sum-grid-container"></div>
        <div class="game-footer">
          <div id="players-container"></div>
          <div id="controls-row"><div class="msg">Sum to match!</div></div>
        </div>
      </div>
    `
  }

  document.getElementById("header-container")!.innerHTML = getHeaderHtml(
    game,
    yourPlayerId
  )
  document.getElementById("players-container")!.innerHTML = getPlayersHtml(game)

  const grid = document.getElementById("grid-container")!

  // Render 10x10 grid
  grid.innerHTML = game.sumGrid
    .map((val, idx) => {
      const claimedBy = game.sumGridClaimed[idx]
      const mySelection = yourPlayerId
        ? game.sumGridSelected[yourPlayerId] || []
        : []
      const isSelected = mySelection.includes(idx)
      const isClaimed = claimedBy !== undefined
      const isClaimedByMe = claimedBy === yourPlayerId

      let cls = "sg-cell"
      if (isSelected) cls += " selected"
      if (isClaimed) cls += " claimed"
      if (isClaimedByMe) cls += " claimed-by-me"

      // Avatar overlay if claimed
      let content = `<span class="sg-val">${val}</span>`
      if (isClaimed) {
        const info = Rune.getPlayerInfo(claimedBy!)
        content += `<div class="sg-owner"><img src="${info.avatarUrl}"/></div>`
      }

      return `
      <div class="${cls}" data-idx="${idx}">
        ${content}
      </div>
    `
    })
    .join("")

  grid.querySelectorAll(".sg-cell").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = parseInt((el as HTMLElement).dataset.idx!)
      Rune.actions.selectSumGridCell(idx)
    })
  })

  // Handle dice animation if target changes?
  handleDiceAnim(game.sumGridTarget)
  handleTimerBar(game)
}

// --- Shared Animation Logic ---
function handleDiceAnim(val: number | null) {
  const el = document.getElementById("dice-display")
  if (!el) return

  // For MindMatch, we pass mindMatchTarget. For others, diceValue.
  // The logic below uses lastDiceVal to detect changes.

  if (val !== null && val !== lastDiceVal) {
    if (!rollAnimationId) {
      let steps = 0
      // Only animate if it's not the initial load?
      // Or always animate on change.
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
    if (rollAnimationId) {
      clearInterval(rollAnimationId)
      rollAnimationId = null
    }
    el.textContent = "?"
    el.classList.remove("pop")
  }
  lastDiceVal = val
}

function handleTimerBar(game: GameState) {
  const bar = document.getElementById("timer-bar")
  if (!bar) return

  // If new dice value (or just starting), reset animation
  // We use the same 'lastDiceVal' tracking from dice anim, but checking it here is safe
  // because render functions run before handleDiceAnim updates lastDiceVal?
  // Wait, handleDiceAnim is called BEFORE handleTimerBar in renderCapture.
  // So lastDiceVal is already updated.
  // We need to check if we need to restart the timer.
  // Actually, we can check if the bar has 'width: 0%' style applied effectively?
  // Easier: Just re-apply the transition calculation every render based on TRUE time remaining.
  // This handles joins mid-game perfectly.

  const timeLeft = Math.max(0, game.nextRollAt - Rune.gameTime())

  // Set the current width based on exact time remaining immediately (no transition)
  // Then transition to 0.
  // BUT: Setting style constantly interrupts CSS transition.
  // SO: Only set it if we detect a significant deviation or start.

  // Alternative: Simply start the CSS transition ONLY when dice changes.
  // But if I join mid game, I need to know where to start.

  // Let's use the 'transition-duration' property to see if we are already animating.
  // Or just force it every time? No, that kills animation.

  // Best way for Rune (synced):
  // 1. Disable transition.
  // 2. Set width to current %.
  // 3. Force reflow.
  // 4. Enable transition to 0 with remaining time.
  // THIS ensures it's always synced to server time even if lags happen.

  // Optimization: Only do this if the transition isn't running roughly correct?
  // Actually, doing this every 'onChange' (which is frequentish) might look jittery if onChange is high freq.
  // But onChange only fires on actions. In capture, it fires on 'click' or 'roll'.
  // Between rolls, onChange DOES NOT FIRE.
  // So this is PERFECT. It only fires once per roll (start of 15s).
  // And maybe once if someone claims (which is fine, it just resyncs).

  // Steps:
  bar.style.transition = "none"
  const pct = (timeLeft / 15000) * 100
  bar.style.width = `${pct}%`

  void bar.offsetWidth // Force reflow

  bar.style.transition = `width ${timeLeft}ms linear`
  bar.style.width = "0%"
}

// --- Main Init ---
Rune.initClient({
  onChange: ({ game, yourPlayerId }) => {
    if (game.screen !== currentScreen) {
      if (matrixAnimationId) {
        cancelAnimationFrame(matrixAnimationId)
        matrixAnimationId = null
      }
      if (rollAnimationId) {
        clearInterval(rollAnimationId)
        rollAnimationId = null
      }
      for (const k in floatingDomCache) delete floatingDomCache[k]
    }

    if (game.screen === "menu") renderMenu()
    else if (game.screen === "bingo") renderBingo(game, yourPlayerId)
    else if (game.screen === "capture") renderCapture(game, yourPlayerId)
    else if (game.screen === "floating") renderFloating(game, yourPlayerId)
    else if (game.screen === "sumGrid") renderSumGrid(game, yourPlayerId)

    currentScreen = game.screen

    if (!document.getElementById("theme-toggle")) {
      const t = document.createElement("button")
      t.id = "theme-toggle"
      t.style.position = "absolute"
      t.style.top = "10px"
      t.style.right = "10px"
      t.style.zIndex = "50"
      t.style.background = "none"
      t.style.border = "none"
      t.style.fontSize = "1.5rem"
      t.style.cursor = "pointer"
      t.textContent = document.body.classList.contains("dark-mode")
        ? "☀️"
        : "🌙"
      root.appendChild(t)
      t.addEventListener("click", () => {
        document.body.classList.toggle("dark-mode")
        t.textContent = document.body.classList.contains("dark-mode")
          ? "☀️"
          : "🌙"
      })
    }
  },
})
