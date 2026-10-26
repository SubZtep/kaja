import type OpenAI from "openai"

/** One assistant message a scripted model answers with. */
export type ScriptedMessage = { content: string | null; tool_calls?: unknown[] }

/** What a scripted model call was sent. */
export type ChatParams = {
  messages: { role: string; content?: unknown; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
}

/**
 * A chat client that plays `script`, one assistant message per model call, streaming its content first. `onCall` sees
 * each call's params (clone what you keep); past the end it answers `fallback`, else throws "script exhausted".
 */
export function scriptedChat(
  script: ScriptedMessage[],
  { onCall, fallback }: { onCall?: (params: ChatParams) => void; fallback?: ScriptedMessage } = {}
) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: ChatParams) => {
          onCall?.(params)
          const message = script[i++] ?? fallback
          if (!message) throw new Error("script exhausted")
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", ...message } }] })
          }
        }
      }
    }
  }
}

/** A tool call as the model sends it, `args` JSON-encoded. */
export const call = (id: string, name: string, args: object) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) }
})

/** A call with its raw `arguments` text, so a test can send malformed JSON. */
export type FakeCall = { id: string; name: string; arguments: string }

/** Scripted stand-in for `chat.completions.stream()`: one assistant message per call, nothing streamed. */
export function scriptedCalls(script: { content: string | null; calls?: FakeCall[] }[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const next = script[i++]
          if (!next) throw new Error("fake script exhausted")
          const tool_calls = next.calls?.map(c => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.arguments }
          }))
          const message = { role: "assistant", content: next.content, ...(tool_calls ? { tool_calls } : {}) }
          return {
            async *[Symbol.asyncIterator]() {},
            finalChatCompletion: async () => ({ choices: [{ message }] })
          }
        }
      }
    }
  } as unknown as OpenAI
}
