import { startConfetti, stopConfetti } from "./lib/confetti"
import { createHandLandmarker } from "./lib/mediapipe"
import { render } from "solid-js/web"
import { Loop } from "./lib/loop"
import App from "./components/App"
import "./app/conn"
import "cursor-bee"
import "./style.css"

render(() => <App />, document.getElementById("app")!)

await createHandLandmarker()

new Loop().start()

startConfetti()
setTimeout(() => stopConfetti(), 369)
