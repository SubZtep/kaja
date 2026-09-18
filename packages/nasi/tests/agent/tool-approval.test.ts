import { expect, test } from "bun:test"
import type OpenAI from "openai"
import { Agent, askUserTool, createSession } from "../../src/agent/agent"
import { run } from "../../src/agent/run"
import { runApprovedTool, type Tool, tool } from "../../src/agent/tools"

type FakeCall = { id: string; name: string; arguments: string }

/** Scripted stand-in for `chat.completions.stream()`: one assistant message per call. */
function fakeClient(script: { content: string | null; calls?: FakeCall[] }[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const next = script[i++]
          if (!next) throw new Error("fake script exhausted")
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
            async *[Symbol.asyncIterator]() {},
            finalChatCompletion: async () => ({ choices: [{ message }] })
          }
        }
      }
    }
  } as unknown as OpenAI
}

let executed: unknown[] = []
const createIssue: Tool<{ title: string }> = {
  ...tool<{ title: string }>({
    name: "create_issue",
    description: "Create an issue",
    parameters: { type: "object", properties: { title: { type: "string" } } },
    execute: async args => {
      executed.push(args)
      return `created ${args.title}`
    }
  }),
  approval: args => `POST https://api.example.com/issues {"title":"${args.title}"}`
}

function agentWith(script: Parameters<typeof fakeClient>[0]) {
  executed = []
  return new Agent({
    model: "m",
    client: fakeClient(script),
    tools: [askUserTool, createIssue],
    promptContext: { environment: "test" }
  })
}

async function collect(gen: AsyncGenerator<unknown>) {
  const events: any[] = []
  for await (const event of gen) events.push(event)
  return events
}

test("a tool with an approval summary pauses the turn instead of running", async () => {
  const agent = agentWith([
    { content: null, calls: [{ id: "c1", name: "create_issue", arguments: '{"title":"Bug"}' }] }
  ])
  const session = createSession()
  const events = await collect(run(agent, "file a bug", session))
  expect(events.at(-1)).toEqual({
    type: "confirm_tool",
    name: "create_issue",
    arguments: '{"title":"Bug"}',
    summary: 'POST https://api.example.com/issues {"title":"Bug"}'
  })
  expect(executed).toEqual([])
  expect(session.pendingToolApprovalId).toBe("c1")
})

test("the host's result on resume answers the pending call and the turn continues", async () => {
  const agent = agentWith([
    { content: null, calls: [{ id: "c1", name: "create_issue", arguments: '{"title":"Bug"}' }] },
    { content: "Filed it." }
  ])
  const session = createSession()
  await collect(run(agent, "file a bug", session))
  const result = await runApprovedTool(agent.tools, "create_issue", '{"title":"Bug"}')
  expect(result).toBe("created Bug")
  const events = await collect(run(agent, result, session))
  expect(events.at(-1)).toEqual({ type: "final", content: "Filed it." })
  expect(session.pendingToolApprovalId).toBeUndefined()
  expect(session.messages).toContainEqual({ role: "tool", tool_call_id: "c1", content: "created Bug" })
})

test("a second approval in the same round, or one beside ask_user, is answered instead of left hanging", async () => {
  const agent = agentWith([
    {
      content: null,
      calls: [
        { id: "a", name: "create_issue", arguments: '{"title":"One"}' },
        { id: "b", name: "create_issue", arguments: '{"title":"Two"}' },
        { id: "q", name: "ask_user", arguments: '{"question":"Which repo?"}' }
      ]
    }
  ])
  const session = createSession()
  const events = await collect(run(agent, "file two bugs", session))
  expect(events.at(-1)).toEqual({ type: "ask_user", question: "Which repo?" })
  const answered = session.messages
    .filter(m => m.role === "tool")
    .map(m => (m as { tool_call_id: string }).tool_call_id)
  expect(answered.sort()).toEqual(["a", "b"])
  expect(session.pendingToolApprovalId).toBeUndefined()
})

test("runApprovedTool reports an unknown tool or bad arguments as text", async () => {
  expect(await runApprovedTool([createIssue], "nope", "{}")).toBe('Error: unknown tool "nope"')
  expect(await runApprovedTool([createIssue], "create_issue", "{not json")).toStartWith("Error:")
})
