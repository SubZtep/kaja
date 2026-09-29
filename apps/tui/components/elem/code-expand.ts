import { createContext, useContext, useEffect } from "react"

/** How code shows: `expanded` prints every line, otherwise `lines` of it (`preferences.codePreviewLines`). `register` lets a code block that is longer than the preview say so while it is mounted, and returns how to withdraw. */
export type CodeView = { expanded: boolean; lines: number; register?: () => () => void }

export const DEFAULT_CODE_LINES = 5

export const CodeViewContext = createContext<CodeView>({ expanded: false, lines: DEFAULT_CODE_LINES })

/** Tells the app, while mounted, that some code here is longer than the preview, so the expand button is worth showing. */
export function useReportOverflow(overflow: boolean | undefined) {
  const { register } = useContext(CodeViewContext)
  useEffect(() => (overflow ? register?.() : undefined), [overflow, register])
}
