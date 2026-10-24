import type { WidgetTarget } from "@kaja/schema/api"

/** Bump when the contract below changes so open drafts are regenerated instead of reused. */
export const WIDGET_PROMPT_VERSION = 1

export type PromptWidget = {
  label: string
  intent: string
  target: WidgetTarget
  links: { label: string; intent: string; target: WidgetTarget }[]
}

const BOARD_CONTRACT = `The page mounts this document in a sandboxed iframe and speaks only through postMessage.
Listen for { type: "state", phase, question, aside, questionCount, maxQuestions, answers } where each answer is { value, label }.
You fill only the question area, about 96px tall: render the question and aside for the phase. The page draws the counter and the answer buttons under you.
If you add a control, post { type: "answer", value } using a value you were given (never the label), or { type: "start" }, { type: "restart" }, or { type: "giveup" }.
Use the answers' labels for any text about them, so the page's language is kept. Use a transparent background.
Do not call fetch, do not read cookies, and do not mention tokens.`

const PLAYER_CONTRACT = `Export one function: play({ history, locale, maxQuestions, ai }).
history is { role, content }[]. locale is a BCP 47 tag. ai.chat(messages) returns the assistant text. Call it at most twice.
Return { type: "question" | "guess" | "giveup", text } where text is what the visitor should read, in locale, at most 200 characters.
Ask one yes/no question at a time. Use "guess" only when naming the thing. Use "giveup" only when maxQuestions is reached.
Do not call fetch, and do not mention tokens.`

/** The model writes the widget's source from this. The token is never included. */
export function widgetSourcePrompt(widget: PromptWidget): string {
  const contract = widget.target.kind === "browser" ? BOARD_CONTRACT : PLAYER_CONTRACT
  const fence = widget.target.kind === "browser" ? "html" : "js"
  const target =
    widget.target.kind === "browser"
      ? `browser page "${widget.target.page}", mounted at ${widget.target.selector}`
      : "server module"
  const links =
    widget.links.length === 0
      ? "none"
      : widget.links.map(link => `- ${link.label} (${link.target.kind}): ${link.intent}`).join("\n")
  return `Write the source for one Kaja widget. Reply with a single \`\`\`${fence} fence and nothing else.
Target: ${target}
Intent: ${widget.intent}
Linked widgets:
${links}
${contract}`
}
