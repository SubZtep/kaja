import { tool } from "../../agent/agent"
import { summarize, TEXT_STYLE } from "../../agent/compaction"
import { getToolDeps } from "../deps"

/**
 * Summarizes a piece of text with the summarize model (else the chat model), in parts when it's too long for one request.
 *
 * @param args.text - The text to summarize.
 * @param args.instructions - Optional extra guidance, e.g. "focus on
 * pricing" or "3 bullet points".
 * @returns The generated summary.
 */
export const summarizeTool = tool<{
  text: string
  instructions?: string
}>({
  name: "summarize",
  description:
    "Summarize a long piece of text. You MUST call this tool on any long " +
    "text before including it in your reply — e.g. after fetch_url returns " +
    "a long page — rather than condensing or paraphrasing it yourself. Do " +
    "not skip this call just because you're capable of summarizing the " +
    "text directly.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text to summarize"
      },
      instructions: {
        type: "string",
        description: "Optional extra guidance, e.g. 'focus on pricing' or '3 bullet points'"
      }
    },
    required: ["text"]
  },
  execute: async args => {
    const { summarizer, chat } = getToolDeps()
    const model = summarizer ?? chat
    if (!model) return "Summarize is not configured."
    return summarize(model, [args.text], { style: TEXT_STYLE, focus: args.instructions })
  }
})
