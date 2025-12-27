import "./styles.css"
import { PlayerId } from "rune-sdk"
import { GameState, Equation } from "./logic.ts"

// Initialize DOM Structure
const root = document.querySelector("main") || document.body
root.innerHTML = `
  <div id="game-container">
    <header id="header">
      <div id="dice-display">?</div>
      <div id="status-text">Waiting...</div>
    </header>

    <div id="board-area"></div>

    <footer id="footer">
      <div id="players-row"></div>
      <div id="controls-row">
        <button id="passBtn" class="action-btn secondary">Pass</button>
        <button id="rollBtn" class="action-btn primary">Roll Dice</button>
      </div>
    </footer>
  </div>
`

// Elements
const diceEl = document.getElementById("dice-display")!
const statusEl = document.getElementById("status-text")!
const boardEl = document.getElementById("board-area")!
const playersEl = document.getElementById("players-row")!
const passBtn = document.getElementById("passBtn")!
const rollBtn = document.getElementById("rollBtn")!

// State for animations
let lastDiceVal: number | null = null
let rollAnimationId: any = null

function getPlayerName(playerId: PlayerId) {
  const p = Rune.getPlayerInfo(playerId)
  return p.displayName || "Player"
}

// ---------------- RENDERERS ----------------

function renderHeader(game: GameState, yourPlayerId: PlayerId | undefined) {
  const currentVal = game.diceValue
  const currentPlayer = game.playerIds[game.currentPlayerIndex]
  const isMyTurn = currentPlayer === yourPlayerId
  const phase = game.phase

  // Dice Visual Logic
  if (currentVal !== null) {
    if (currentVal !== lastDiceVal) {
      // New value detected: Trigger Roll Animation
      if (rollAnimationId) clearInterval(rollAnimationId)
      
      diceEl.classList.add("active")
      let steps = 0
      
      rollAnimationId = setInterval(() => {
        steps++
        // Show random number between 1 and 10
        diceEl.textContent = (Math.floor(Math.random() * 10) + 1).toString()
        
        // End animation after ~600ms (12 steps * 50ms)
        if (steps >= 12) {
          clearInterval(rollAnimationId)
          rollAnimationId = null
          
          // Set final actual value
          diceEl.textContent = currentVal.toString()
          
          // Pop effect on land
          diceEl.classList.remove("pop")
          void diceEl.offsetWidth // Trigger reflow
          diceEl.classList.add("pop")
        }
      }, 50)
      
    } else if (!rollAnimationId) {
      // No change and no active animation: Ensure static state is correct
      // (Handles re-renders during static state)
      diceEl.textContent = currentVal.toString()
      diceEl.classList.add("active")
    }
  } else {
    // Reset state
    if (rollAnimationId) {
        clearInterval(rollAnimationId)
        rollAnimationId = null
    }
    diceEl.textContent = "?"
    diceEl.classList.remove("active")
    diceEl.classList.remove("pop")
  }
  
  lastDiceVal = currentVal

  // Status Text
  if (phase === 'rolling') {
    statusEl.textContent = isMyTurn ? "Tap Roll to start your turn" : `${getPlayerName(currentPlayer)} is rolling...`
  } else { 
    // If rolling animation is active, maybe say "Rolling..."? 
    // But keeping it simple for now, status updates immediately.
    statusEl.textContent = isMyTurn ? `Select an equation for ${currentVal} or Pass` : `${getPlayerName(currentPlayer)} is choosing...`
  }
}

function renderBoard(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
  const isClaiming = game.phase === 'claiming'
  
  boardEl.innerHTML = ''
  
  game.equations.forEach(eq => {
    const card = document.createElement("div")
    card.className = "equation-card"
    
    // Core math text
    let cardContent = `<span class="eq-math">${eq.val1} ${eq.operator} ${eq.val2}</span>`

    // Avatar container
    cardContent += `<div class="avatars-container">`
    eq.claimedBy.forEach(pid => {
      const pInfo = Rune.getPlayerInfo(pid)
      cardContent += `<img src="${pInfo.avatarUrl}" class="mini-avatar" alt="${pInfo.displayName}"/>`
    })
    cardContent += `</div>`

    // State Logic
    const iHaveClaimed = yourPlayerId && eq.claimedBy.includes(yourPlayerId)
    
    if (iHaveClaimed) {
      card.classList.add("claimed-by-me")
      card.classList.add("claimed-disabled") 
    } else {
      if (isMyTurn && isClaiming) {
        card.classList.add("interactive")
        card.onclick = () => {
          Rune.actions.claimEquation(eq.id)
        }
      } else {
        card.classList.add("not-interactive")
      }
    }

    card.innerHTML = cardContent
    boardEl.appendChild(card)
  })
}

function renderPlayers(game: GameState, yourPlayerId: PlayerId | undefined) {
  playersEl.innerHTML = ''
  
  game.playerIds.forEach(pid => {
    const isTurn = game.playerIds[game.currentPlayerIndex] === pid
    const pState = game.players[pid]
    const info = Rune.getPlayerInfo(pid)
    
    const seat = document.createElement("div")
    seat.className = `player-seat ${isTurn ? 'turn-active' : ''}`
    
    let statusBadge = ''
    if (pState.lastAction === 'hit') statusBadge = '<span class="badge hit">✓</span>'
    else if (pState.lastAction === 'miss') statusBadge = '<span class="badge miss">✗</span>'
    else if (pState.lastAction === 'pass') statusBadge = '<span class="badge pass">−</span>'
    
    seat.innerHTML = `
      <div class="avatar-wrapper">
        <img src="${info.avatarUrl}" />
        ${statusBadge}
      </div>
      <div class="p-score">${pState.score} / 10</div>
    `
    
    playersEl.appendChild(seat)
  })
}

function renderControls(game: GameState, yourPlayerId: PlayerId | undefined) {
  const isMyTurn = game.playerIds[game.currentPlayerIndex] === yourPlayerId
  const phase = game.phase

  rollBtn.style.display = 'none'
  passBtn.style.display = 'none'

  if (isMyTurn && !game.winner) {
    if (phase === 'rolling') {
      rollBtn.style.display = 'block'
    } else if (phase === 'claiming') {
      passBtn.style.display = 'block'
    }
  }
}

// ---------------- INIT ----------------

rollBtn.addEventListener("click", () => Rune.actions.rollDice())
passBtn.addEventListener("click", () => Rune.actions.pass())

Rune.initClient({
  onChange: ({ game, yourPlayerId }) => {
    renderHeader(game, yourPlayerId)
    renderBoard(game, yourPlayerId)
    renderPlayers(game, yourPlayerId)
    renderControls(game, yourPlayerId)
  },
})
