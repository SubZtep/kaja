import { expect, test } from "bun:test"
import type OpenAI from "openai"
import { z } from "zod"
import { Agent, askUserTool, createSession } from "../../src/agent/agent"
import { run } from "../../src/agent/run"
import { runApprovedTool, type Tool, tool } from "../../src/agent/tools"
import { png } from "../fixtures/images"

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
  const events: unknown[] = []
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
    id: "c1",
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
  expect(result).toEqual({ text: "created Bug", images: [] })
  const events = await collect(run(agent, result.text, session))
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
  expect(events.at(-1)).toEqual({ type: "ask_user", question: "Which repo?", id: "q", fromTool: true })
  const answered = session.messages
    .filter(m => m.role === "tool")
    .map(m => (m as { tool_call_id: string }).tool_call_id)
  expect(answered.sort()).toEqual(["a", "b"])
  expect(session.pendingToolApprovalId).toBeUndefined()
})

test("runApprovedTool reports an unknown tool or bad arguments as text", async () => {
  expect((await runApprovedTool([createIssue], "nope", "{}")).text).toBe('Error: unknown tool "nope"')
  expect((await runApprovedTool([createIssue], "create_issue", "{not json")).text).toStartWith("Error:")
})

test("an approved tool's images reach the model with its answer, normalised", async () => {
  const snap: Tool<Record<string, never>> = {
    ...tool({
      name: "snap",
      description: "Takes a picture",
      schema: z.object({}),
      execute: async () => ({ text: "snapped", images: [{ data: png(3000, 100), mimeType: "image/png" }] })
    }),
    approval: () => "Take a picture"
  }
  const result = await runApprovedTool([snap], "snap", "{}")
  expect(result.text).toBe("snapped")
  expect(result.images).toHaveLength(1)

  const session = createSession()
  session.pendingToolApprovalId = "c1"
  session.messages.push(
    { role: "user", content: "take one" },
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "snap", arguments: "{}" } }]
    }
  )
  await collect(run(agentWith([{ content: "Nice." }]), result.text, session, undefined, result.images))
  expect(session.messages[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "snapped" })
  const image = session.messages[3] as {
    role: string
    content: { type: string; text?: string; image_url?: { url: string } }[]
  }
  expect(image.role).toBe("user")
  expect(image.content[0]).toEqual({ type: "text", text: "[Image (1568×52): snapped]" })
  const url = image.content[1]!.image_url!.url
  expect(url).toStartWith("data:image/png;base64,")
  expect((await new Bun.Image(Buffer.from(url.split(",")[1]!, "base64")).metadata()).width).toBe(1568)
})

test("a photo the user sends instead of approving is labelled as theirs, not with the skipped call's note", async () => {
  const session = createSession()
  session.pendingToolApprovalId = "c1"
  session.messages.push(
    { role: "user", content: "file it" },
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "create_issue", arguments: "{}" } }]
    }
  )
  const photo = `data:image/png;base64,${Buffer.from(png(4, 4)).toString("base64")}`
  const prompt = "Not run: the user didn't approve it and wrote instead: here it is"
  await collect(run(agentWith([{ content: "Got it." }]), prompt, session, undefined, [photo]))
  expect(JSON.stringify(session.messages)).toContain("(4×4): an image the user sent]")
})

test("yolo runs a tool that would ask, and a command that isn't safe, without pausing", async () => {
  const { runCommandTool } = await import("../../src/agent/agent")
  executed = []
  const agent = new Agent({
    model: "m",
    client: fakeClient([
      {
        content: null,
        calls: [
          { id: "c1", name: "create_issue", arguments: '{"title":"Bug"}' },
          // Shell metacharacters always ask without yolo
          { id: "c2", name: "run_command", arguments: '{"command":"echo yolo-ran; true"}' }
        ]
      },
      { content: "done" }
    ]),
    tools: [createIssue, runCommandTool],
    promptContext: { environment: "test" },
    yolo: true
  })
  const session = createSession()
  const events = (await collect(run(agent, "go", session))) as { type: string }[]
  expect(events.map(event => event.type)).not.toContain("confirm_tool")
  expect(events.map(event => event.type)).not.toContain("confirm_command")
  expect(executed).toEqual([{ title: "Bug" }])
  const results = session.messages.filter(message => message.role === "tool").map(message => message.content as string)
  expect(results.some(result => result.includes("yolo-ran"))).toBe(true)
  expect(session.pendingToolApprovalId).toBeUndefined()
  expect(session.pendingRunCommandId).toBeUndefined()
})
