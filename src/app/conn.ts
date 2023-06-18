import { produce, unwrap } from "solid-js/store"
import { socket } from "../lib/websocket"
import { startConfetti, stopConfetti } from "../lib/confetti"
import { state, setState, players } from "../state"

const compareWorker = new Worker("/workers/compare.js")
let lastMessageTime = 0

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data) as Player & { time: number }
  if (message.time <= lastMessageTime) return
  lastMessageTime = message.time

  if (!message.colour) {
    // remove player
    setState({
      playerIds: state.playerIds.filter(id => id !== message.id),
      lastPlayersUpdate: Date.now(),
      lastLandmarksUpdate: Date.now(),
    })
    players.delete(message.id)
    return
  }

  if (!players.has(message.id)) {
    players.set(message.id, message)
    setState(
      produce(state => {
        state.playerIds.push(message.id)
      })
    )
  } else if (players.get(message.id)!.colour !== message.colour) {
    document.querySelectorAll<HTMLCanvasElement>(`[data-pid="${message.id}"]`).forEach(el => {
      el.style.setProperty("--colour", message.colour)
    })
  }

  players.set(message.id, message)
  setState({ lastPlayersUpdate: Date.now() })

  // find similar poses
  if (players.size > 1) {
    const { playerIds, angleThreshold: threshold } = unwrap(state)
    compareWorker.postMessage({ playerIds, threshold, players })
  } else {
    stopConfetti()
  }
})

compareWorker.addEventListener("message", ({ data: isSimilar }) => {
  if (isSimilar) {
    startConfetti()
  } else {
    stopConfetti()
  }
})
