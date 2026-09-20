import { expect, test } from "bun:test"
import type OpenAI from "openai"
import { Agent, createSession } from "../../src/agent/agent"
import { run } from "../../src/agent/run"
import { recordPausedCall } from "../../src/agent/telemetry"
import { runApprovedTool, type Tool, tool } from "../../src/agent/tools"

type Round = {
  content: string | null
  calls?: { id: string; name: string; arguments: string }[]
  usage?: { prompt_tokens: number; completion_tokens: number }
  finish?: string
  model?: string
}

/** Scripted `chat.completions.stream()`: one round per call, with the usage chunk and finish reason a provider sends. */
function fakeClient(script: Round[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const next = script[i++]!
          const message = {
            role: "assistant",
            content: next.content,
            ...(next.calls
              ? {
                  tool_calls: next.calls.map(c => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.name, arguments: c.arguments }
                  }))
                }
              : {})
          }
          return {
            async *[Symbol.asyncIterator]() {
              if (next.usage) yield { model: next.model, choices: [{ delta: {} }], usage: next.usage }
            },
            finalChatCompletion: async () => ({ choices: [{ message, finish_reason: next.finish }] })
          }
        }
      }
    }
  } as unknown as OpenAI
}

const echo = tool<{ text: string }>({
  name: "echo",
  description: "Echo",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  execute: async args => args.text
})
const boom = tool<Record<string, never>>({
  name: "boom",
  description: "Always fails",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    throw new Error("nope")
  }
})
const gated: Tool<{ title: string }> = {
  ...tool<{ title: string }>({
    name: "gated",
    description: "Needs approval",
    parameters: { type: "object", properties: { title: { type: "string" } } },
    execute: async args => `did ${args.title}`
  }),
  approval: args => `do ${args.title}`
}

function agentWith(script: Round[], tools: Tool<any>[] = [echo, boom, gated]) {
  return new Agent({ model: "requested", client: fakeClient(script), tools, promptContext: { environment: "test" } })
}

async function drain(gen: AsyncGenerator<unknown>) {
  for await (const _ of gen);
}

test("each round is recorded beside its assistant message, the system prompt not counted", async () => {
  const agent = agentWith([
    {
      content: null,
      calls: [{ id: "c1", name: "echo", arguments: '{"text":"hi"}' }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
      finish: "tool_calls",
      model: "served-model"
    },
    { content: "done", usage: { prompt_tokens: 20, completion_tokens: 5 }, finish: "stop" }
  ])
  agent.personaId = "kaja"
  const session = createSession()
  await drain(run(agent, "go", session))

  // messages: system, user, assistant(tool call), tool, assistant → rows 0..3 without the system prompt
  expect(session.telemetry!.steps).toEqual([
    {
      at: 1,
      model: "served-model",
      persona: "kaja",
      promptTokens: 12,
      completionTokens: 3,
      latencyMs: expect.any(Number),
      finishReason: "tool_calls"
    },
    {
      at: 3,
      model: "requested",
      persona: "kaja",
      promptTokens: 20,
      completionTokens: 5,
      latencyMs: expect.any(Number),
      finishReason: "stop"
    }
  ])
  expect(session.messages[2]).toMatchObject({ role: "assistant" })
  expect(session.telemetry!.calls).toEqual({ c1: { status: "ok", durationMs: expect.any(Number) } })
})

test("a tool that throws is recorded as an error, and the run still aborts as before", async () => {
  const agent = agentWith([{ content: null, calls: [{ id: "c1", name: "boom", arguments: "{}" }] }])
  const session = createSession()
  await expect(drain(run(agent, "go", session))).rejects.toThrow("nope")
  expect(session.telemetry!.calls.c1).toEqual({ status: "error", durationMs: expect.any(Number) })
})

test("unparseable arguments are an error, a second held approval is skipped", async () => {
  const agent = agentWith([
    {
      content: null,
      calls: [
        { id: "c1", name: "echo", arguments: "{not json" },
        { id: "c2", name: "gated", arguments: '{"title":"a"}' },
        { id: "c3", name: "gated", arguments: '{"title":"b"}' }
      ]
    }
  ])
  const session = createSession()
  await drain(run(agent, "go", session))
  expect(session.telemetry!.calls).toEqual({ c1: { status: "error" }, c3: { status: "skipped" } })
  expect(session.pendingToolApprovalId).toBe("c2")
})

test("a human's answer to the paused call is recorded on it, however it went", async () => {
  const start = async () => {
    const session = createSession()
    await drain(
      run(
        agentWith([{ content: null, calls: [{ id: "c2", name: "gated", arguments: '{"title":"a"}' }] }]),
        "go",
        session
      )
    )
    session.telemetry = undefined
    return session
  }

  const declined = await start()
  recordPausedCall(declined, "tool_approval", "declined")
  expect(declined.telemetry!.calls.c2).toEqual({ status: "declined", approval: "declined" })

  const skipped = await start()
  recordPausedCall(skipped, "tool_approval", "skipped")
  expect(skipped.telemetry!.calls.c2).toEqual({ status: "skipped" })

  const approved = await start()
  let status: "ok" | "error" = "ok"
  const startedAt = performance.now()
  await runApprovedTool([gated], "gated", '{"title":"a"}', s => {
    status = s
  })
  recordPausedCall(approved, "tool_approval", { status, startedAt })
  expect(approved.telemetry!.calls.c2).toEqual({ status: "ok", approval: "approved", durationMs: expect.any(Number) })

  // nothing pending: nothing recorded
  recordPausedCall(createSession(), "tool_approval", "declined")
})

test("runApprovedTool reports which way the call went", async () => {
  const seen: string[] = []
  await runApprovedTool([boom], "boom", "{}", s => seen.push(s))
  await runApprovedTool([echo], "echo", '{"text":"x"}', s => seen.push(s))
  await runApprovedTool([echo], "missing", "{}", s => seen.push(s))
  expect(seen).toEqual(["error", "ok", "error"])
})
