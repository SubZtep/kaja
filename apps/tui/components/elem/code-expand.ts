import { createContext } from "react"

/** Whether long code blocks (in answers and the run confirm) show every line instead of a capped preview; toggled by the expand hotkey. */
export const CodeExpandContext = createContext(false)

/** Lines of a code block shown before it is capped. */
export const CODE_PREVIEW_LINES = 15
