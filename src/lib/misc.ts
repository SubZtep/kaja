import type { Landmark } from "@mediapipe/tasks-vision"

export const css = String.raw
export const html = String.raw

/** For testing purposes */
export function slowCalculation(times = 1) {
  let result = 0
  for (let i = 0; i < 1_000_000_00 * times; i++) {
    result += i
  }
  return result
}

export function createRandomColour() {
  return `#${Math.floor(Math.random() * 16777215).toString(16)}`
}

export function isLandmarkList(value: any): value is Landmark[] {
  return Array.isArray(value)
}

export function isAngles(value: any): value is Angles {
  return value != null
}
