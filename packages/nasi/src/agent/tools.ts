import { LOCAL_OWNER } from "@kaja/schema/store"
import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions"

/** Identifies who's talking to a {@link Tool}'s `execute`, and which persona is active — `owner` is `null` for a terminal session, `"telegram:<id>"` for a Telegram user; `personaId` mirrors {@link Agent.personaId}. Supplied by {@link run}, never by the model. */
export type ToolContext = { owner: string | null; personaId?: string }

/** Default {@link ToolContext} for tools invoked without one (e.g. directly in tests) — same as a terminal session. */
export const LOCAL_OWNER_CTX: ToolContext = { owner: LOCAL_OWNER }

/**
 * A tool result that includes images alongside text — e.g. a browser
 * screenshot. Images can't travel in the `role: "tool"` message itself (the
 * OpenAI API restricts tool message content to text), so {@link run} sends
 * `text` as the tool response and follows up with a separate `role: "user"`
 * message carrying each image, so the model actually sees it.
 */
export type ToolResult = {
  text: string
  images?: { path: string; mimeType: string }[]
  /**
   * A remote image to show next to the tool's result in the timeline —
   * display-only, e.g. a search result thumbnail. Unlike {@link images},
   * this never reaches the model: it's not fed back as vision content, just
   * yielded as a `display_image` event for the UI.
   */
  displayImage?: { url: string; alt: string }
}

/**
 * Thrown by a tool's `execute()` on failure (e.g. a non-OK HTTP response),
 * carrying the tool's name so the UI can label the error by source instead
 * of showing one generic message for every kind of failure.
 */
export class ToolError extends Error {
  readonly toolName: string

  constructor(toolName: string, message: string) {
    super(message)
    this.toolName = toolName
  }
}

/**
 * A tool an {@link Agent} can call, pairing the OpenAI function definition
 * with the local implementation that runs when the model calls it.
 */
export type Tool<Args> = {
  definition: ChatCompletionTool
  execute: (args: Args, ctx?: ToolContext) => Promise<string | ToolResult>
}

/**
 * Defines a tool from a JSON schema and an executor function.
 */
export function tool<Args>(config: {
  name: string
  description: string
  parameters: ChatCompletionFunctionTool["function"]["parameters"]
  execute: (args: Args, ctx?: ToolContext) => Promise<string | ToolResult>
}): Tool<Args> {
  return {
    definition: {
      type: "function",
      function: {
        name: config.name,
        description: config.description,
        parameters: config.parameters
      }
    },
    execute: config.execute
  }
}

export function toolName(t: Tool<unknown>): string {
  if (t.definition.type !== "function") throw new Error("tool is missing function definition")
  return t.definition.function.name
}
