import { LOCAL_OWNER } from "@kaja/schema/store"
import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions"
import { z } from "zod"
import type { NasiStore } from "../store/types"

/** Identifies who's talking to a {@link Tool}'s `execute`, and which persona is active — `owner` is `null` for a terminal session, `"telegram:<id>"` for a Telegram user; `personaId` mirrors {@link Agent.personaId}. Supplied by {@link run}, never by the model. */
export type ToolContext = {
  owner: string | null
  personaId?: string
  store?: NasiStore
  /** Records a model call the tool made itself (the summarize tool's), so the session's usage counts it. */
  onModelCall?: (usage: ModelCallUsage) => void
}

/** What one model request cost, as {@link summarize} reports it. */
export type ModelCallUsage = { model: string; promptTokens?: number; completionTokens?: number; latencyMs: number }

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
 * Who stands behind a tool: Kaja itself (`official`) or an ability in the marketplace folder,
 * synced or your own (`community`). Shown in doctor/ability, never to the model.
 */
export type ToolOrigin = "official" | "community"

/**
 * A tool an {@link Agent} can call, pairing the OpenAI function definition
 * with the local implementation that runs when the model calls it. A bare `Tool` is any tool, for the mixed lists hosts pass around.
 */
// biome-ignore lint/suspicious/noExplicitAny: a list holds tools with different arguments, and `execute`'s parameter rules out `unknown`
export type Tool<Args = any> = {
  definition: ChatCompletionTool
  /**
   * The arguments' schema, on built-in tools: run() checks the model's arguments against it before `execute` (see
   * {@link checkToolArgs}). Tools with an outside JSON Schema (MCP servers, HTTP abilities, plugins) have none; their
   * server checks. Untyped here so a Tool stays assignable the way it was before it had a schema; {@link tool} ties the
   * two together.
   */
  schema?: z.ZodType
  execute: (args: Args, ctx?: ToolContext) => Promise<string | ToolResult>
  /** True only for the cloud-registered stub of a tool that must run on the client (see registry.ts's CLIENT_EXECUTABLE). Never set on the real implementation. */
  requiresClientExecution?: boolean
  /**
   * When set and it returns a summary for these arguments, run() pauses before executing and
   * emits `confirm_tool` with it; the host runs the tool itself once the human approves.
   */
  approval?: (args: Args) => string | undefined
  /** An MCP tool that only reads (the server's readOnlyHint, or a manifest `readOnly` rule without `unless`). */
  readOnly?: boolean
  /** Stamped by the registry's `mergeTools`; unset on a tool that hasn't been through it. */
  origin?: ToolOrigin
  /** Where a non-official tool came from, e.g. `ability:open-meteo`. */
  source?: string
}

type FunctionParameters = ChatCompletionFunctionTool["function"]["parameters"]

/**
 * Defines a tool from a zod schema (built-ins: the model's arguments are checked against it, and its JSON Schema is
 * what the model sees, unless `parameters` spells that out itself) or from an outside JSON Schema (MCP servers, HTTP
 * abilities, code tools: taken as they are).
 */
export function tool<S extends z.ZodType>(config: {
  name: string
  description: string
  schema: S
  parameters?: FunctionParameters
  execute: (args: z.output<S>, ctx?: ToolContext) => Promise<string | ToolResult>
}): Tool<z.output<S>>
export function tool<Args>(config: {
  name: string
  description: string
  parameters: FunctionParameters
  execute: (args: Args, ctx?: ToolContext) => Promise<string | ToolResult>
}): Tool<Args>
export function tool(config: {
  name: string
  description: string
  schema?: z.ZodType
  parameters?: FunctionParameters
  execute: (args: unknown, ctx?: ToolContext) => Promise<string | ToolResult>
}): Tool<unknown> {
  return {
    definition: {
      type: "function",
      function: {
        name: config.name,
        description: config.description,
        parameters: config.parameters ?? (config.schema && jsonSchemaFor(config.schema))
      }
    },
    schema: config.schema,
    execute: config.execute
  }
}

// What the model is sent for a zod schema: the input side (a field with a default isn't required), without `$schema` or z.int()'s implied safe-integer bounds, and with `required` even when empty, as the hand-written ones were.
function jsonSchemaFor(schema: z.ZodType): FunctionParameters {
  const { $schema: _, ...parameters } = z.toJSONSchema(schema, {
    io: "input",
    override: ({ jsonSchema }) => {
      if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum
      if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum
      if (jsonSchema.type === "object" && jsonSchema.properties && !jsonSchema.required) jsonSchema.required = []
    }
  })
  return parameters
}

/** The model's arguments checked against the tool's schema (a tool without one takes them as they are), or the error to send back to the model instead of running it. */
export function checkToolArgs<Args>(
  t: Tool<Args>,
  args: unknown
): { ok: true; args: Args } | { ok: false; error: string } {
  if (!t.schema) return { ok: true, args: args as Args }
  const parsed = t.schema.safeParse(args)
  if (parsed.success) return { ok: true, args: parsed.data as Args }
  return { ok: false, error: `Invalid arguments for ${toolName(t)}:\n${z.prettifyError(parsed.error)}` }
}

export function toolName(t: Tool): string {
  if (t.definition.type !== "function") throw new Error("tool is missing function definition")
  return t.definition.function.name
}

/**
 * Runs a tool call the human approved after a `confirm_tool` pause, returning the text to feed
 * back as its result. Hosts call this with their own tool list; a missing tool, bad arguments or
 * a failure come back as text so the model can react, and `onStatus` hears which way it went.
 */
export async function runApprovedTool(
  tools: Tool[],
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
    const checked = checkToolArgs(target, JSON.parse(argumentsJson || "{}"))
    if (!checked.ok) {
      onStatus?.("error")
      return `Error: ${checked.error}`
    }
    const result = await target.execute(checked.args)
    onStatus?.("ok")
    return typeof result === "string" ? result : result.text
  } catch (error) {
    onStatus?.("error")
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}
