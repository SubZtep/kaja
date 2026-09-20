import { LOCAL_OWNER } from "@kaja/schema/store"
import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions"
import type { NasiStore } from "../store/types"

/** Identifies who's talking to a {@link Tool}'s `execute`, and which persona is active — `owner` is `null` for a terminal session, `"telegram:<id>"` for a Telegram user; `personaId` mirrors {@link Agent.personaId}. Supplied by {@link run}, never by the model. */
export type ToolContext = { owner: string | null; personaId?: string; store?: NasiStore }

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
 * Who stands behind a tool: Kaja itself (`official`), a package in the marketplace
 * folder, synced or your own (`community`), or an outside MCP server or tools/*.ts
 * plugin (`third-party`). Shown in doctor/pkg, never to the model.
 */
export type ToolOrigin = "official" | "community" | "third-party"

/**
 * A tool an {@link Agent} can call, pairing the OpenAI function definition
 * with the local implementation that runs when the model calls it.
 */
export type Tool<Args> = {
  definition: ChatCompletionTool
  execute: (args: Args, ctx?: ToolContext) => Promise<string | ToolResult>
  /** True only for the cloud-registered stub of a tool that must run on the client (see registry.ts's CLIENT_EXECUTABLE). Never set on the real implementation. */
  requiresClientExecution?: boolean
  /**
   * When set and it returns a summary for these arguments, run() pauses before executing and
   * emits `confirm_tool` with it; the host runs the tool itself once the human approves.
   */
  approval?: (args: Args) => string | undefined
  /** Stamped by the registry's `mergeTools`; unset on a tool that hasn't been through it. */
  origin?: ToolOrigin
  /** Where a non-official tool came from, e.g. `package:open-meteo`, `mcp:chrome-devtools`, `plugin:ping.ts`. */
  source?: string
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

export function toolName(t: Tool<any>): string {
  if (t.definition.type !== "function") throw new Error("tool is missing function definition")
  return t.definition.function.name
}

/**
 * Runs a tool call the human approved after a `confirm_tool` pause, returning the text to feed
 * back as its result. Hosts call this with their own tool list; a missing tool, bad arguments or
 * a failure come back as text so the model can react, and `onStatus` hears which way it went.
 */
export async function runApprovedTool(
  tools: Tool<any>[],
  name: string,
  argumentsJson: string,
  onStatus?: (status: "ok" | "error") => void
): Promise<string> {
  const target = tools.find(t => toolName(t) === name)
  if (!target) {
    onStatus?.("error")
    return `Error: unknown tool "${name}"`
  }
  try {
    const result = await target.execute(JSON.parse(argumentsJson || "{}"))
    onStatus?.("ok")
    return typeof result === "string" ? result : result.text
  } catch (error) {
    onStatus?.("error")
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}
