import { useCallback, useMemo, useState } from "react"
import type { CodeView } from "../components/elem/code-expand"

/** The code preview state: the value for `CodeViewContext`, how to toggle the expansion, and whether any mounted code is longer than the preview (so the expand button is worth showing). */
export function useCodeView(lines: number) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(0)
  const register = useCallback(() => {
    setOverflowing(n => n + 1)
    return () => setOverflowing(n => n - 1)
  }, [])
  const view: CodeView = useMemo(() => ({ expanded, lines, register }), [expanded, lines, register])
  const toggle = useCallback(() => setExpanded(prev => !prev), [])
  return { view, toggle, canExpand: overflowing > 0 }
}
