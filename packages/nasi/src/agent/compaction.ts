import type OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { DEFAULT_CONTEXT_WINDOW } from "../models/context-window"
import type { Agent, Session } from "./agent"

/** Share of the context window at which a round compacts first, unless the host sets {@link Agent.compactAt}. */
export const DEFAULT_COMPACT_AT = 0.8

/** Share of the window the word-for-word recent turns may take after compacting. */
const KEEP_SHARE = 0.25

/** Share of the window one tool result may take before the model gets it condensed instead. */
const OVERSIZED_RESULT_SHARE = 0.25

/** Share of the summarizer's window one summary request may fill with conversation text. */
const SUMMARIZE_INPUT_SHARE = 0.6

// A rough tokens-per-character ratio; run() calibrates it against what the provider reports.
const CHARS_PER_TOKEN = 4

/** What a compaction did, for the `compacted` event and `/compact`'s reply. */
export type Compaction = { beforeTokens: number; afterTokens: number; dropped: boolean }

// Serializes a message for counting, with inline images as a flat cost instead of their base64.
function sizeOf(value: unknown): number {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "string" && v.startsWith("data:") ? "x".repeat(1000 * CHARS_PER_TOKEN) : v
  ).length
}

/** A character-count estimate of what `messages` (and the tool definitions) cost in tokens. */
export function estimateTokens(messages: readonly unknown[], definitions: readonly unknown[] = []): number {
  return Math.ceil((sizeOf(messages) + (definitions.length > 0 ? sizeOf(definitions) : 0)) / CHARS_PER_TOKEN)
}

// The messages with each condensed tool result in place of its full output.
function condensed(session: Session, messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  const summaries = session.toolSummaries
  if (!summaries) return messages
  return messages.map(message =>
    message.role === "tool" && summaries[message.tool_call_id] !== undefined
      ? { ...message, content: summaries[message.tool_call_id]! }
      : message
  )
}

/**
 * What the model is sent: the full log (with oversized tool results condensed), or once compacted the system
 * prompt with the summary appended, then the messages from `summary.from` on. The session's own log is never
 * shortened.
 */
export function contextMessages(session: Session): ChatCompletionMessageParam[] {
  const { summary } = session
  const messages = condensed(session, session.messages)
  if (!summary) return messages
  const block = `## Earlier in this conversation\n\nThe older part of this conversation was summarised to save space:\n\n${summary.text}`
  const first = messages[0]
  const system: ChatCompletionMessageParam =
    first?.role === "system" && typeof first.content === "string"
      ? { role: "system", content: `${first.content}\n\n${block}` }
      : { role: "system", content: block }
  return [system, ...messages.slice(summary.from)]
}

// Where the not-yet-summarised part of the log starts: after the last summary, else after the system prompt.
function summarisedUpTo(session: Session): number {
  return session.summary?.from ?? (session.messages[0]?.role === "system" ? 1 : 0)
}

/**
 * Picks where the word-for-word tail starts: the earliest point whose tail fits `budget` tokens, preferring
 * the start of a user turn, else any assistant message (a tool result never starts the tail, so each call
 * keeps its result). Undefined when nothing new can be summarised.
 */
export function chooseCut(session: Session, budget: number): number | undefined {
  const messages = condensed(session, session.messages)
  const start = summarisedUpTo(session)
  const fits = (at: number) => estimateTokens(messages.slice(at)) <= budget
  const candidates = (roles: string[]) =>
    messages.flatMap((message, at) => (at > start && roles.includes(message.role) ? [at] : []))

  const userTurns = candidates(["user"])
  const anyStep = candidates(["user", "assistant"])
  return userTurns.find(fits) ?? anyStep.find(fits) ?? anyStep.at(-1)
}

// The latest user message after the last summary: `/compact` keeps only that turn word for word.
function lastTurnStart(session: Session): number | undefined {
  const start = summarisedUpTo(session)
  const at = session.messages.findLastIndex(message => message.role === "user")
  return at > start ? at : undefined
}

function partText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map(part => (part?.type === "text" ? part.text : "[image]")).join(" ")
}

/** The messages as a plain transcript for the summarizer, one entry per message. */
export function transcriptOf(messages: readonly ChatCompletionMessageParam[]): string[] {
  return messages.flatMap(message => {
    if (message.role === "system") return []
    if (message.role === "tool") return [`Tool result:\n${partText(message.content)}`]
    if (message.role === "assistant") {
      const calls = (message.tool_calls ?? []).flatMap(call =>
        call.type === "function" ? [`[called ${call.function.name}(${call.function.arguments})]`] : []
      )
      const text = partText(message.content)
      return text || calls.length > 0 ? [`Assistant: ${[text, ...calls].filter(Boolean).join("\n")}`] : []
    }
    return [`User: ${partText(message.content)}`]
  })
}

/** How a summary request is worded: the instructions, a line repeated after the text, and what a part is a part of. */
export type SummaryStyle = { instructions: string; reminder?: string; whole: string }

const SUMMARY_INSTRUCTIONS =
  "You compress a conversation between a user and an AI assistant so the assistant can carry on from your notes " +
  "instead of the full text. Write concise notes that keep: what the user wants (including the latest request, if " +
  "it's still open), decisions and facts established, names, numbers, file paths, commands and their outcomes, and " +
  "what is done and what remains. Leave out pleasantries and repeated tool output. Write notes only, never a reply " +
  "to the user. Write them in the language the user writes in; never translate them into another one."

/** Notes a conversation can carry on from; the language rule is repeated after the text, since some models otherwise drift into their own default language. */
export const CONVERSATION_STYLE: SummaryStyle = {
  instructions: SUMMARY_INSTRUCTIONS,
  reminder: "(Write the notes in the same language as the user's messages above.)",
  whole: "the conversation"
}

/** A tool's output, condensed for the assistant that called it. */
export const TOOL_OUTPUT_STYLE: SummaryStyle = {
  instructions:
    "You condense the output of a tool an AI assistant called, so it can use the output without reading all of it. " +
    "Keep everything it is likely to need: facts, numbers, names, identifiers, file paths, URLs, error messages and " +
    "their causes, and anything that answers what it was working on. Keep useful structure such as sections and " +
    "lists. Drop boilerplate and repetition. Write only the condensed output, in the output's own language.",
  whole: "the output"
}

/** Any text, summarised for a reader (the `summarize` tool). */
export const TEXT_STYLE: SummaryStyle = {
  instructions:
    "Summarize the following text concisely, preserving the key facts and any specifics a reader would need.",
  whole: "the text"
}

async function summarizeOnce(
  chat: { client: OpenAI; model: string },
  text: string,
  focus: string | undefined,
  style: SummaryStyle
): Promise<string> {
  const completion = await chat.client.chat.completions.create({
    model: chat.model,
    messages: [
      {
        role: "system",
        content: focus ? `${style.instructions}\n\nPay special attention to: ${focus}` : style.instructions
      },
      { role: "user", content: style.reminder ? `${text}\n\n${style.reminder}` : text }
    ]
  })
  const summary = completion.choices[0]?.message.content?.trim()
  if (!summary) throw new Error("The summary came back empty")
  return summary
}

// Packs transcript entries into chunks of at most `limit` characters; an entry longer than that is split.
function chunk(entries: string[], limit: number): string[] {
  const chunks: string[] = []
  let current = ""
  for (const entry of entries) {
    for (let at = 0; at < Math.max(entry.length, 1); at += limit) {
      const piece = entry.slice(at, at + limit)
      if (current && current.length + piece.length + 2 > limit) {
        chunks.push(current)
        current = ""
      }
      current = current ? `${current}\n\n${piece}` : piece
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Summarises transcript entries (after an earlier summary, if any) with the summarizer: in one request when
 * they fit its window, else part by part and then the parts' summaries together, as often as needed.
 */
export async function summarize(
  chat: { client: OpenAI; model: string; contextWindow?: number },
  entries: string[],
  opts: { previous?: string; focus?: string; style?: SummaryStyle } = {}
): Promise<string> {
  const style = opts.style ?? CONVERSATION_STYLE
  const limit = Math.max(
    2000,
    Math.floor((chat.contextWindow ?? DEFAULT_CONTEXT_WINDOW) * SUMMARIZE_INPUT_SHARE * CHARS_PER_TOKEN)
  )
  const all = opts.previous ? [`Summary of what came before:\n${opts.previous}`, ...entries] : entries
  let chunks = chunk(all, limit)
  while (chunks.length > 1) {
    const parts = await Promise.all(
      chunks.map((text, index) =>
        summarizeOnce(chat, `Part ${index + 1} of ${chunks.length} of ${style.whole}:\n\n${text}`, opts.focus, style)
      )
    )
    chunks = chunk(parts, limit)
  }
  return summarizeOnce(chat, chunks[0] ?? "", opts.focus, style)
}

/**
 * Compacts the session: summarises everything before a tail that fits a quarter of the window (or, with
 * `lastTurnOnly`, before the latest user message), and records it
 * as {@link Session.summary}. When the summarizer fails, the older part is dropped with a note instead, so the
 * conversation can go on. Undefined when there is nothing new to summarise.
 */
export async function compactSession(
  agent: Agent,
  session: Session,
  opts: { focus?: string; definitions?: readonly unknown[]; lastTurnOnly?: boolean } = {}
): Promise<Compaction | undefined> {
  const window = agent.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const cut = opts.lastTurnOnly ? lastTurnStart(session) : chooseCut(session, Math.floor(window * KEEP_SHARE))
  if (cut === undefined) return undefined

  const beforeTokens = estimateTokens(contextMessages(session), opts.definitions)
  const chat = agent.summarizer ?? { client: agent.client, model: agent.model, contextWindow: agent.contextWindow }
  const previous = session.summary?.text
  const entries = transcriptOf(condensed(session, session.messages.slice(summarisedUpTo(session), cut)))

  let text: string
  let dropped = false
  try {
    text = await summarize(chat, entries, { previous, focus: opts.focus })
  } catch {
    dropped = true
    text = [previous, "(Some earlier messages were dropped here without a summary.)"].filter(Boolean).join("\n\n")
  }
  session.summary = { text, from: cut }
  return { beforeTokens, afterTokens: estimateTokens(contextMessages(session), opts.definitions), dropped }
}

// The call behind a tool result and the user's request it served, so the condensed output keeps what matters.
function purposeOf(messages: ChatCompletionMessageParam[], at: number, callId: string): string {
  const call = messages
    .slice(0, at)
    .findLast(m => m.role === "assistant")
    ?.tool_calls?.find(c => c.id === callId)
  const request = messages.slice(0, at).findLast(m => m.role === "user")
  const called =
    call?.type === "function" ? `${call.function.name}(${call.function.arguments.slice(0, 300)})` : "a tool"
  return `the assistant called ${called} while working on: ${partText(request?.content).slice(0, 500)}`
}

/**
 * Condenses each tool result bigger than a quarter of the window, once: the summarizer rewrites it (in parts
 * when it doesn't fit), and the model is sent that instead of the full output, which stays in the log.
 * When the summarizer fails, the start of the output is kept with a note. Returns what was condensed.
 */
export async function condenseOversizedResults(
  agent: Agent,
  session: Session
): Promise<{ beforeTokens: number; afterTokens: number }[]> {
  if (!agent.contextWindow) return []
  const limit = Math.floor(agent.contextWindow * OVERSIZED_RESULT_SHARE)
  const chat = agent.summarizer ?? { client: agent.client, model: agent.model, contextWindow: agent.contextWindow }
  const { messages } = session
  const done: { beforeTokens: number; afterTokens: number }[] = []
  for (let at = summarisedUpTo(session); at < messages.length; at++) {
    const message = messages[at]!
    if (message.role !== "tool" || session.toolSummaries?.[message.tool_call_id] !== undefined) continue
    const output = partText(message.content)
    const beforeTokens = estimateTokens([output])
    if (beforeTokens <= limit) continue

    let text: string
    try {
      text = await summarize(chat, [output], {
        style: TOOL_OUTPUT_STYLE,
        focus: purposeOf(messages, at, message.tool_call_id)
      })
    } catch {
      text = `${output.slice(0, Math.floor(limit * CHARS_PER_TOKEN * 0.5))}\n[… the rest was cut: it couldn't be condensed]`
    }
    const condensedText = `[Condensed from about ${beforeTokens.toLocaleString("en")} tokens of output]\n${text}`
    session.toolSummaries = { ...session.toolSummaries, [message.tool_call_id]: condensedText }
    done.push({ beforeTokens, afterTokens: estimateTokens([condensedText]) })
  }
  return done
}

const OVERFLOW_PATTERN =
  /context[ _-]?(length|window)|maximum context|too many tokens|prompt is too long|input is too long|exceeds? the (model'?s )?(context|max)|reduce the length/i

/** Whether a provider error says the request didn't fit the model's context. */
export function isContextOverflow(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  if (code === "context_length_exceeded") return true
  return error instanceof Error && OVERFLOW_PATTERN.test(error.message)
}
