import { state, setState, myLandmarks } from "../state"
import { sendMessage } from "./websocket"
import { predictCamera } from "./mediapipe"

/** Run a function */
export const runOnce = new Set<TickFn>()

/** Run a function every frame */
export const runForever = new Set<TickFn>()

export class Loop {
  /** Set up the animation loop */
  #previousTime = 0

  start() {
    const animate = (currentTime: number) => {
      requestAnimationFrame(animate)

      // Calculate the time difference (delta) since the last frame
      const deltaTime = (currentTime - this.#previousTime) / 1000 // Convert to seconds
      this.#previousTime = currentTime

      runForever.forEach(fn => fn(deltaTime))
      runOnce.forEach(fn => fn(deltaTime))
      runOnce.clear()
    }

    requestAnimationFrame(animate)
    return this
  }
}

let rafId: number
export const startHandLoop = async () => {
  handLoop()
}

const handLoop = async () => {
  rafId = requestAnimationFrame(handLoop)
  const landmarks = await predictCamera()
  if (landmarks) {
    myLandmarks.clear()
    landmarks.forEach(landmark => myLandmarks.add(landmark))
    setState({ lastLandmarksUpdate: Date.now() })
  }
}

export const stopHandLoop = () => {
  cancelAnimationFrame(rafId)
}

const anglesWorker = new Worker("/workers/angles.js")
let messageInterval: NodeJS.Timer
let lastMessageTime = 0

anglesWorker.onmessage = ({ data: message }) => {
  sendMessage(message)
}

export const startMessageLoop = (fps = 60) => {
  messageInterval = setInterval(() => {
    if (state.lastLandmarksUpdate <= lastMessageTime) return

    const message: Record<string, any> = {
      id: state.id,
      colour: state.colour,
      time: Date.now(),
    }

    if (myLandmarks.size > 0) {
      anglesWorker.postMessage({ message, landmarks: myLandmarks })
    }

    lastMessageTime = Date.now()
  }, 1_000 / fps)
}

export const stopMessageLoop = () => {
  clearInterval(messageInterval)
  sendMessage({ id: state.id, time: Date.now() })
}
