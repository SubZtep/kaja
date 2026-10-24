import { z } from "zod"
import type { PlayRequest, PlayResult } from "./rules"

const playResultSchema = z.object({
  type: z.enum(["question", "guess", "giveup"]),
  // Twenty questions of this, in a three-byte script, still fit the 16 KB widget state
  text: z.string().min(1).max(200)
})

const messagesSchema = z
  .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1).max(16_000) }))
  .max(40)

const HARNESS = String.raw`
const pending = new Map()
self.onmessage = async (event) => {
  const data = event.data
  if (data && data.type === "chat-result") {
    const wait = pending.get(data.id)
    if (!wait) return
    pending.delete(data.id)
    if (data.error) wait.reject(new Error(data.error))
    else wait.resolve(data.text)
    return
  }
  if (!data || data.type !== "play") return
  let chats = 0
  const ai = {
    chat(messages) {
      return new Promise((resolve, reject) => {
        chats += 1
        if (chats > 2) {
          reject(new Error("too many completions"))
          return
        }
        const id = crypto.randomUUID()
        pending.set(id, { resolve, reject })
        self.postMessage({ type: "chat", id, messages })
      })
    }
  }
  try {
    const source = String(data.source).replace(/export\s+((?:async\s+)?function\s+play)/, "$1")
    const play = new Function("history", "locale", "maxQuestions", "ai", source + "\nreturn play({ history, locale, maxQuestions, ai })")
    const result = await play(data.history, data.locale, data.maxQuestions, ai)
    self.postMessage({ type: "result", result })
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "play failed" })
  }
}
`

export type PlayerChat = (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<string>

/** Runs published player source in a worker. The worker is not given the token; `chat` performs the completion. */
export function runPlayer(source: string, request: PlayRequest, chat: PlayerChat): Promise<PlayResult> {
  const url = URL.createObjectURL(new Blob([HARNESS], { type: "text/javascript" }))
  const worker = new Worker(url)
  let chats = 0
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("timeout")), 30_000)
    const finish = (error?: Error, result?: PlayResult) => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve(result!)
    }
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string; messages?: unknown; result?: unknown; message?: string }
      if (data.type === "chat" && data.id) {
        chats += 1
        if (chats > 2) {
          worker.postMessage({ type: "chat-result", id: data.id, error: "too many completions" })
          return
        }
        const messages = messagesSchema.safeParse(data.messages)
        if (!messages.success) {
          worker.postMessage({ type: "chat-result", id: data.id, error: "bad messages" })
          return
        }
        void chat(messages.data)
          .then(text => worker.postMessage({ type: "chat-result", id: data.id, text }))
          .catch(() => worker.postMessage({ type: "chat-result", id: data.id, error: "chat failed" }))
        return
      }
      if (data.type === "result") {
        const parsed = playResultSchema.safeParse(data.result)
        finish(parsed.success ? undefined : new Error("bad result"), parsed.success ? parsed.data : undefined)
        return
      }
      if (data.type === "error") finish(new Error(data.message || "play failed"))
    }
    worker.onerror = () => finish(new Error("play failed"))
    worker.postMessage({ type: "play", source, ...request })
  })
}
