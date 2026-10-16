import { type DOMElement, measureElement } from "ink"
import type { RefObject } from "react"
import { useTerminalReports } from "../../hooks/use-terminal-reports"
import { parseMouse } from "../../lib/terminal-input"

type Rect = { left: number; top: number; right: number; bottom: number }

const intersect = (a: Rect, b: Rect): Rect => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom)
})

// Where an element is on screen (alternate screen: layout row 0 is row 0), less scroll offsets, clipped by overflow-hidden boxes
function screenRect(node: DOMElement): Rect | undefined {
  const rectOf = (element: DOMElement, scrolled: number): Rect => {
    const { x, y, width, height } = measureElement(element)
    return { left: x, top: y - scrolled, right: x + width, bottom: y - scrolled + height }
  }
  // Each ancestor's scroll offset moves everything inside it, so an ancestor's own rect only counts the ones above it.
  const ancestors: DOMElement[] = []
  for (let parent = node.parentNode; parent; parent = parent.parentNode) ancestors.push(parent)
  const offsetAbove = (index: number) =>
    ancestors.slice(index + 1).reduce((sum, element) => sum + Math.trunc(Number(element.style.contentOffsetY) || 0), 0)
  let rect = rectOf(node, offsetAbove(-1))
  ancestors.forEach((element, index) => {
    if (element.style.overflow === "hidden" || element.style.overflowY === "hidden")
      rect = intersect(rect, rectOf(element, offsetAbove(index)))
  })
  return rect.right > rect.left && rect.bottom > rect.top ? rect : undefined
}

/** Runs `onClick` when the mouse presses inside `ref`'s box where it's visible (the chat turns mouse reports on). */
export function useClick(ref: RefObject<DOMElement | null>, onClick: () => void) {
  useTerminalReports(input => {
    const mouse = parseMouse(input)
    if (mouse?.kind !== "press" || !ref.current) return
    const rect = screenRect(ref.current)
    if (rect && mouse.col >= rect.left && mouse.col < rect.right && mouse.row >= rect.top && mouse.row < rect.bottom)
      onClick()
  })
}
