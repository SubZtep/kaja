import type OpenAI from "openai"
import type { ChatCompletionContentPartText, ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { warn } from "../warn"
import type { Agent, Session } from "./agent"
import { recordModelCall } from "./telemetry"

/** The vision task's model, which describes images as they arrive. */
export type Describer = { client: OpenAI; model: string }

const DESCRIBE_INSTRUCTIONS =
  "Describe this image for someone who can't see it, in 1 to 3 short sentences (at most 300 characters): what it " +
  "shows and what matters in it. Quote short visible text that matters (a heading, an error line) exactly. Write in " +
  "English. No preamble, just the description."

/** Longest description kept; the model is asked for 300 characters. */
const MAX_DESCRIPTION = 400

/** How long a turn waits for a description before it goes on with the alt text. */
export const DESCRIBE_TIMEOUT_MS = 30_000

/**
 * The text part that stands for an image in its message: what it is (`text`: the alt, then its description), and the
 * link to view it again.
 */
export function imageLabel(ref: string, size: { width: number; height: number } | undefined, text: string): string {
  const link = ref.startsWith("data:") ? "" : ` ${ref}`
  const dims = size ? ` (${size.width}×${size.height})` : ""
  return `[Image${link}${dims}: ${text}]`
}

// An image being described: its ref (its label starts with it), its size, and the description once it's in.
type Pending = { ref: string; size?: { width: number; height: number }; done: Promise<void>; text?: string }

const pendingBySession = new WeakMap<Session, Pending[]>()

/**
 * Has the agent's describer write `image`'s description in the background (or takes the one stored beside it), to
 * replace its label's alt text once ready (see {@link applyDescriptions}). Nothing without a describer.
 */
export function describeInBackground(
  agent: Agent,
  session: Session,
  stored: { ref: string; size?: { width: number; height: number } },
  dataUrl: string,
  keep: { saved?: () => Promise<string | undefined>; save?: (text: string, model: string) => Promise<void> }
): void {
  const describer = agent.describer
  // An inline image has no link to tell its label from the others by.
  if (!describer || stored.ref.startsWith("data:")) return
  const pending: Pending = { ref: stored.ref, size: stored.size, done: Promise.resolve() }
  pending.done = (async () => {
    try {
      const saved = await keep.saved?.()
      if (saved) {
        pending.text = saved
        return
      }
      const text = await describeImage(describer, dataUrl, usage =>
        recordModelCall(session, { kind: "describe", ...usage })
      )
      if (!text) {
        warn("The vision model gave an image no description", { model: describer.model })
        return
      }
      pending.text = text
      await keep.save?.(text, describer.model)
    } catch (error) {
      warn("An image couldn't be described", { model: describer.model, error })
    }
  })()
  pendingBySession.set(session, [...(pendingBySession.get(session) ?? []), pending])
}

/**
 * Puts the descriptions written so far into their images' labels, and says which (for the hosts' image rows). With
 * `wait`, first waits for the ones still being written (at most {@link DESCRIBE_TIMEOUT_MS}): a chat model that can't
 * see has nothing else to go on, and a turn ends with them in, so the saved session keeps them.
 */
export async function applyDescriptions(
  session: Session,
  wait: boolean
): Promise<{ ref: string; description: string }[]> {
  const pending = pendingBySession.get(session)
  if (!pending?.length) return []
  if (wait) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>(resolve => {
      timer = setTimeout(resolve, DESCRIBE_TIMEOUT_MS)
    })
    await Promise.race([Promise.all(pending.map(entry => entry.done)), timeout])
    clearTimeout(timer)
  }
  const ready = pending.filter(entry => entry.text !== undefined)
  for (const entry of ready) relabel(session.messages, entry.ref, imageLabel(entry.ref, entry.size, entry.text!))
  // After a wait, one still without text failed or ran out of time: it keeps its alt text (a late one is still kept beside the image).
  const left = wait ? [] : pending.filter(entry => entry.text === undefined)
  if (left.length) pendingBySession.set(session, left)
  else pendingBySession.delete(session)
  return ready.map(entry => ({ ref: entry.ref, description: entry.text! }))
}

function relabel(messages: ChatCompletionMessageParam[], ref: string, label: string): void {
  const start = imageLabel(ref, undefined, "").slice(0, -3)
  for (const message of messages) {
    if (message.role !== "user" || !Array.isArray(message.content)) continue
    message.content = message.content.map(part =>
      part.type === "text" && part.text.startsWith(start)
        ? ({ ...part, text: label } as ChatCompletionContentPartText)
        : part
    )
  }
}

/** One image described by the vision model, `undefined` when it gave nothing back. */
export async function describeImage(
  describer: Describer,
  dataUrl: string,
  onCall?: (usage: { model: string; promptTokens?: number; completionTokens?: number; latencyMs: number }) => void
): Promise<string | undefined> {
  const startedAt = performance.now()
  const completion = await describer.client.chat.completions.create(
    {
      model: describer.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DESCRIBE_INSTRUCTIONS },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 200
    },
    { timeout: DESCRIBE_TIMEOUT_MS }
  )
  onCall?.({
    model: completion.model ?? describer.model,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens,
    latencyMs: Math.round(performance.now() - startedAt)
  })
  const text = completion.choices[0]?.message?.content?.replace(/\s+/g, " ").trim()
  if (!text) return undefined
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text
}
