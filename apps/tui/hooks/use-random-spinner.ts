import { useEffect, useState } from "react"

export const DOTS_SPINNERS = [
  "dots",
  "dots2",
  "dots3",
  "dots4",
  "dots5",
  "dots6",
  "dots7",
  "dots8",
  "dots9",
  "dots10",
  "dots11",
  "dots13",
  "dots8Bit",
  "sand",
  "line",
  "line2",
  "pipe",
  "star",
  "flip",
  "hamburger",
  "balloon",
  "balloon2",
  "bounce",
  "toggle13",
  "layer"
] as const

export const BLOCK_SPINNERS = [
  "growVertical",
  "growHorizontal",
  "noise",
  "boxBounce",
  "boxBounce2",
  "triangle"
] as const

/** Block-families are a list of [cli-spinners](https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json)'s SpinnerName. */
const SPINNER_TEMPLATES = {
  dots: DOTS_SPINNERS,
  block: BLOCK_SPINNERS
}

export type SpinnerTemplate = keyof typeof SPINNER_TEMPLATES

/** Picks a uniformly random index in [0, length) using crypto.getRandomValues, rejecting values that would bias the modulo. */
function randomIndex(length: number): number {
  const max = 2 ** 32
  const limit = max - (max % length)
  const buffer = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0] ?? 0
  } while (value >= limit)
  return value % length
}

function randomSpinner<Template extends SpinnerTemplate>(
  template: Template
): (typeof SPINNER_TEMPLATES)[Template][number] {
  const spinners = SPINNER_TEMPLATES[template]
  return spinners[randomIndex(spinners.length)] ?? spinners[0]
}

/** Re-rolls a random spinner from `template` each time `active` transitions to true. */
export function useRandomSpinner<Template extends SpinnerTemplate>(
  active: boolean,
  template: Template
): (typeof SPINNER_TEMPLATES)[Template][number] {
  const [spinnerType, setSpinnerType] = useState(() => randomSpinner(template))

  useEffect(() => {
    if (!active) return
    setSpinnerType(randomSpinner(template))
  }, [active, template])

  return spinnerType
}
