import { expect, test } from "bun:test"
import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { Agent, type AgentEvent, createSession, type Session } from "../../src/agent/agent"
import {
  chooseCut,
  contextMessages,
  estimateTokens,
  isContextOverflow,
  summarize,
  transcriptOf
} from "../../src/agent/compaction"
import { compact, run } from "../../src/agent/run"
import { tool } from "../../src/agent/tools"

type Sent = ChatCompletionMessageParam[]

/**
 * A fake client: `stream()` answers each round with `reply` (or throws the next queued error), `create()` is the
 * summarizer. Records what each round and each summary request was sent.
 */
function fakeClient(
  opts: {
    reply?: string
    summary?: string | Error
    streamErrors?: Error[]
    /** Rounds that call a tool before the plain `reply`, one call per round. */
    calls?: { name: string; arguments: string }[]
  } = {}
) {
  const calls = [...(opts.calls ?? [])]
  const rounds: Sent[] = []
  const summaries: Sent[] = []
  const streamErrors = [...(opts.streamErrors ?? [])]
  const client = {
    chat: {
      completions: {
        stream: (body: { messages: Sent }) => {
          const error = streamErrors.shift()
          rounds.push(structuredClone(body.messages))
          return {
            // biome-ignore lint/correctness/useYield: a failing stream throws before its first chunk
            async *[Symbol.asyncIterator]() {
              if (error) throw error
            },
            finalChatCompletion: async () => {
              const call = calls.shift()
              const message = call
                ? {
                    role: "assistant",
                    content: null,
                    tool_calls: [{ id: `call_${calls.length}`, type: "function", function: call }]
                  }
                : { role: "assistant", content: opts.reply ?? "ok" }
              return { choices: [{ message, finish_reason: call ? "tool_calls" : "stop" }] }
            }
          }
        },
        create: async (body: { messages: Sent }) => {
          summaries.push(body.messages)
          if (opts.summary instanceof Error) throw opts.summary
          return { choices: [{ message: { content: opts.summary ?? "SUMMARY" } }] }
        }
      }
    }
  } as unknown as OpenAI
  return { client, rounds, summaries }
}

const words = (n: number) => "word ".repeat(n).trim()

/** A session with a system prompt and `turns` user/assistant pairs of about `size` tokens each message. */
function history(turns: number, size = 50): Session {
  const session = createSession()
  session.messages.push({ role: "system", content: "SYSTEM" })
  for (let i = 0; i < turns; i++) {
    session.messages.push({ role: "user", content: `question ${i} ${words(size)}` })
    session.messages.push({ role: "assistant", content: `answer ${i} ${words(size)}` })
  }
  return session
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

test("contextMessages: the full log until compacted, then system + summary + the kept tail", () => {
  const session = history(3)
  expect(contextMessages(session)).toBe(session.messages)

  session.summary = { text: "they talked", from: 5 }
  const sent = contextMessages(session)
  expect(sent[0]).toEqual({ role: "system", content: expect.stringContaining("SYSTEM") })
  expect(sent[0]!.content).toContain("they talked")
  expect(sent.slice(1)).toEqual(session.messages.slice(5))
  // The log itself is never shortened.
  expect(session.messages).toHaveLength(7)
})

test("chooseCut starts the tail at a user turn that fits, never at a tool result", () => {
  const session = history(4)
  const tailOfTwoTurns = estimateTokens(session.messages.slice(5))
  expect(chooseCut(session, tailOfTwoTurns)).toBe(5)
  expect(session.messages[5]!.role).toBe("user")

  const withTool = createSession()
  withTool.messages.push(
    { role: "system", content: "S" },
    { role: "user", content: words(400) },
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c", type: "function", function: { name: "t", arguments: "{}" } }]
    },
    { role: "tool", tool_call_id: "c", content: words(10) },
    { role: "assistant", content: "done" }
  )
  // Too small for the user turn: the latest assistant step is the cut, and the tool result stays with its call.
  const cut = chooseCut(withTool, estimateTokens(withTool.messages.slice(2)))
  expect(cut).toBe(2)
})

test("chooseCut: nothing new to summarise after the last summary", () => {
  const session = history(1)
  session.summary = { text: "x", from: 2 }
  expect(chooseCut(session, 1)).toBeUndefined()
})

test("transcriptOf renders roles, tool calls and results, and skips the system prompt", () => {
  expect(
    transcriptOf([
      { role: "system", content: "S" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "c", type: "function", function: { name: "ls", arguments: "{}" } }]
      },
      { role: "tool", tool_call_id: "c", content: "a.txt" }
    ])
  ).toEqual(["User: hi", "Assistant: [called ls({})]", "Tool result:\na.txt"])
})

test("summarize splits what doesn't fit the summarizer into parts, then summarises the parts", async () => {
  const { client, summaries } = fakeClient()
  const entries = Array.from({ length: 12 }, (_, i) => `User: ${i} ${words(300)}`)
  const summary = await summarize({ client, model: "s", contextWindow: 1000 }, entries, { focus: "numbers" })
  expect(summary).toBe("SUMMARY")
  expect(summaries.length).toBeGreaterThan(2)
  expect(summaries.at(-1)![1]!.content).toContain("SUMMARY")
  expect(summaries[0]![0]!.content).toContain("Pay special attention to: numbers")
})

test("run() compacts before a round once the context passes compactAt, and sends the summary instead", async () => {
  const { client, rounds } = fakeClient({ summary: "they discussed ten questions" })
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 2000, compactAt: 0.8 })
  const session = history(10, 60)

  const events = await collect(run(agent, "next question", session))

  const compacted = events.find(e => e.type === "compacted")
  expect(compacted).toMatchObject({ type: "compacted", dropped: false })
  if (compacted?.type !== "compacted") throw new Error("unreachable")
  expect(compacted.afterTokens).toBeLessThan(compacted.beforeTokens)
  expect(session.summary?.text).toBe("they discussed ten questions")
  expect(rounds[0]![0]!.content).toContain("they discussed ten questions")
  expect(rounds[0]!.some(m => m.content === `question 0 ${words(60)}`)).toBe(false)
  expect(rounds[0]!.at(-1)).toEqual({ role: "user", content: "next question" })
})

test("run() leaves a small conversation alone", async () => {
  const { client, summaries } = fakeClient()
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 100_000 })
  const events = await collect(run(agent, "hi", history(2)))
  expect(events.some(e => e.type === "compacted")).toBe(false)
  expect(summaries).toHaveLength(0)
})

test("when the summarizer fails, the older part is dropped with a note and the turn goes on", async () => {
  const { client, rounds } = fakeClient({ summary: new Error("summarizer down") })
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 2000 })
  const session = history(10, 60)
  const events = await collect(run(agent, "next", session))
  expect(events.find(e => e.type === "compacted")).toMatchObject({ dropped: true })
  expect(session.summary?.text).toContain("dropped")
  expect(events.at(-1)).toMatchObject({ type: "final" })
  expect(rounds).toHaveLength(1)
})

test("a 'context too long' error lowers the window, compacts and retries the round once", async () => {
  const overflow = new OpenAI.APIError(
    400,
    undefined,
    "This model's maximum context length is 1000 tokens",
    new Headers()
  )
  expect(isContextOverflow(overflow)).toBe(true)
  const { client, rounds } = fakeClient({ streamErrors: [overflow] })
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 100_000 })
  const session = history(10, 60)

  const events = await collect(run(agent, "next", session))

  expect(rounds).toHaveLength(2)
  expect(agent.contextWindow).toBeLessThan(100_000)
  expect(session.summary).toBeDefined()
  expect(events.some(e => e.type === "compacted")).toBe(true)
  expect(events.at(-1)).toMatchObject({ type: "final" })
})

test("other provider errors are not retried", async () => {
  const error = new OpenAI.APIError(401, undefined, "invalid api key", new Headers())
  expect(isContextOverflow(error)).toBe(false)
  const { client } = fakeClient({ streamErrors: [error] })
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 100_000 })
  await expect(collect(run(agent, "next", history(2)))).rejects.toThrow("invalid api key")
})

test("compact() summarises on demand with a focus, using the summarizer when set", async () => {
  const chat = fakeClient()
  const summarizer = fakeClient({ summary: "focused notes" })
  const agent = new Agent({
    model: "m",
    client: chat.client,
    tools: [],
    contextWindow: 100_000,
    summarizer: { client: summarizer.client, model: "small" }
  })
  const session = history(3)
  session.messages.push({ role: "user", content: "latest" })

  const result = await compact(agent, session, "the SQL decisions")

  expect(result?.dropped).toBe(false)
  expect(chat.summaries).toHaveLength(0)
  expect(summarizer.summaries[0]![0]!.content).toContain("Pay special attention to: the SQL decisions")
  expect(session.summary).toEqual({ text: "focused notes", from: session.messages.length - 1 })
})

const bigOutput = `Report for the user: ${words(3000)} The answer is 42.`
const dump = tool<Record<string, never>>({
  name: "dump",
  description: "Returns a lot",
  parameters: { type: "object", properties: {} },
  execute: async () => bigOutput
})

test("an oversized tool result reaches the model condensed, while the log keeps the full output", async () => {
  const { client, rounds, summaries } = fakeClient({
    calls: [{ name: "dump", arguments: "{}" }],
    summary: "The answer is 42.",
    reply: "It's 42."
  })
  const agent = new Agent({ model: "m", client, tools: [dump], contextWindow: 8000 })
  const session = createSession()

  const events = await collect(run(agent, "what is the answer?", session))

  const condensed = events.filter(e => e.type === "condensed")
  expect(condensed).toEqual([
    { type: "condensed", tool: "dump", beforeTokens: expect.any(Number), afterTokens: expect.any(Number) }
  ])
  expect(condensed[0]!.afterTokens).toBeLessThan(condensed[0]!.beforeTokens)
  const toolMessage = session.messages.find(m => m.role === "tool")!
  expect(toolMessage.content).toBe(bigOutput)
  const sent = rounds[1]!.find(m => m.role === "tool")!
  expect(sent.content).toStartWith("[Condensed from about")
  expect(sent.content).toContain("The answer is 42.")
  expect(summaries[0]![0]!.content).toContain("dump({})")
  expect(summaries[0]![0]!.content).toContain("what is the answer?")
  // Condensed once: later rounds reuse it.
  expect(Object.keys(session.toolSummaries ?? {})).toHaveLength(1)
})

test("a tool result that fits is left alone", async () => {
  const small = tool<Record<string, never>>({
    name: "small",
    description: "Returns a little",
    parameters: { type: "object", properties: {} },
    execute: async () => "tiny"
  })
  const { client, summaries } = fakeClient({ calls: [{ name: "small", arguments: "{}" }] })
  const session = createSession()
  await collect(run(new Agent({ model: "m", client, tools: [small], contextWindow: 8000 }), "go", session))
  expect(summaries).toHaveLength(0)
  expect(session.toolSummaries).toBeUndefined()
})

test("when the output can't be condensed, its start is kept with a note", async () => {
  const { client, rounds } = fakeClient({ calls: [{ name: "dump", arguments: "{}" }], summary: new Error("down") })
  const session = createSession()
  await collect(run(new Agent({ model: "m", client, tools: [dump], contextWindow: 8000 }), "go", session))
  const sent = rounds[1]!.find(m => m.role === "tool")!.content as string
  expect(sent).toStartWith("[Condensed from about")
  expect(sent).toContain("Report for the user:")
  expect(sent).toContain("couldn't be condensed")
  expect(sent.length).toBeLessThan(bigOutput.length)
})

test("an overflow that survives the retry still reaches the host as a model provider failure", async () => {
  const overflow = () =>
    new OpenAI.APIError(400, undefined, "This model's maximum context length is 1000 tokens", new Headers())
  const { client, rounds } = fakeClient({ streamErrors: [overflow(), overflow()] })
  const agent = new Agent({ model: "m", client, tools: [], contextWindow: 100_000 })
  const error = await collect(run(agent, "next", history(10, 60))).catch(e => e)
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe("NasiModelUnavailable")
  expect(rounds).toHaveLength(2)
})
