import confetti from "canvas-confetti"

const colors = ["#ff0000", "#ffffff", "#0000ff"]
let running = false

const frame = () => {
  confetti({
    particleCount: 2,
    angle: 60,
    spread: 55,
    origin: { x: 0 },
    colors,
  })

  confetti({
    particleCount: 2,
    angle: 120,
    spread: 55,
    origin: { x: 1 },
    colors,
  })

  if (running) {
    requestAnimationFrame(frame)
  }
}

export const startConfetti = () => {
  if (!running) {
    running = true
    frame()
  }
}

export const stopConfetti = () => {
  running = false
}
