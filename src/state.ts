import mobile from "is-mobile"
import { v4 as uuid } from "uuid"
import { createStore } from "solid-js/store"
import { createRandomColour } from "./lib/misc"
import { HAND_LANDMARKS } from "./const"

let id = window.localStorage.getItem("id")
if (!id) {
  id = uuid()
  window.localStorage.setItem("id", id)
}

let colour = window.localStorage.getItem("colour")
if (!colour) {
  colour = createRandomColour()
  window.localStorage.setItem("colour", colour)
}

const isMobile = mobile()
if (isMobile) {
  document.documentElement.style.setProperty("--app-cols", "1fr 1fr")
  document.documentElement.style.setProperty("--app-rows", "1fr auto")
  document.documentElement.style.setProperty("--scenes-display", "grid")
}

export const [state, setState] = createStore({
  id,
  colour,
  isDesktop: !isMobile,
  cameraEnabled: false,
  handDetection: false,
  broadcast: false,
  connected: false,
  broadcastFPS: 15,
  angleThreshold: 30,
  lastLandmarksUpdate: Date.now(),
  lastPlayersUpdate: Date.now(),
  playerIds: [] as string[],
})

export const players = new Map<string, Player>()

export const myLandmarks = new Set<Landmark>(HAND_LANDMARKS)
