import { createEffect, on } from "solid-js"
import { startHandLoop, stopHandLoop } from "../lib/loop"
import { state } from "../state"

export default () => {
  let video: HTMLVideoElement | undefined
  let mediaStream: MediaStream | null = null

  createEffect(
    on(
      () => state.cameraEnabled,
      async () => {
        if (state.cameraEnabled) {
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          video!.srcObject = mediaStream
          setTimeout(() => startHandLoop(), 500)
        } else {
          stopHandLoop()
          video!.srcObject = null
          mediaStream?.getTracks().forEach(track => {
            if (track.readyState === "live") {
              track.stop()
            }
          })
          mediaStream = null
        }
      }
    )
  )

  return <video ref={video} class="grid-col-span-2 stretch" playsinline autoplay muted></video>
}
