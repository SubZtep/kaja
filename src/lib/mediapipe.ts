import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

export let landmarker: HandLandmarker

export const createHandLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(import.meta.env.VITE_WASM)
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: import.meta.env.VITE_TASK,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  })
}

let lastVideoTime = -1

export const predictCamera = async () => {
  const video = document.querySelector<HTMLVideoElement>("video")!
  const startTimeMs = performance.now()
  if (lastVideoTime !== video.currentTime && video.srcObject !== null) {
    lastVideoTime = video.currentTime
    return landmarker.detectForVideo(video, startTimeMs).worldLandmarks[0]
  }
}
