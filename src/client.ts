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

  if (currentVal !== null) {
    diceEl.textContent = currentVal.toString()
    diceEl.classList.add("active")
  } else {
    diceEl.textContent = "?"
    diceEl.classList.remove("active")
  }
  
  if (currentVal !== lastDiceVal && currentVal !== null) {
    diceEl.classList.remove("pop")
    void diceEl.offsetWidth 
    diceEl.classList.add("pop")
  }
  lastDiceVal = currentVal

  if (phase === 'rolling') {
    statusEl.textContent = isMyTurn ? "Tap Roll to start your turn" : `${getPlayerName(currentPlayer)} is rolling...`
  } else { 
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
      // If I claimed it, it's done/dull for me.
      card.classList.add("claimed-by-me")
      // Not interactive for me anymore.
      card.classList.add("claimed-disabled") 
    } else {
      // I haven't claimed it. 
      // It is interactive IF it's my turn AND claiming phase.
      if (isMyTurn && isClaiming) {
        card.classList.add("interactive")
        card.onclick = () => {
          Rune.actions.claimEquation(eq.id)
        }
      } else {
        // Not my turn, but I haven't claimed it. It stays bright (not dull).
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