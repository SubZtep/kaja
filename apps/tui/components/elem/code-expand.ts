import { createContext } from "react"

/** How code shows: `expanded` prints every line, otherwise `lines` of it (`preferences.codePreviewLines`). Toggled by the expand hotkey. */
export type CodeView = { expanded: boolean; lines: number }

export const DEFAULT_CODE_LINES = 5

export const CodeViewContext = createContext<CodeView>({ expanded: false, lines: DEFAULT_CODE_LINES })
