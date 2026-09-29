import { expect, test } from "bun:test"
import type OpenAI from "openai"
import { z } from "zod"
import { Agent, createSession } from "../../src/agent/agent"
import { run } from "../../src/agent/run"
import { checkToolArgs, runApprovedTool, tool } from "../../src/agent/tools"
import { rememberNoteTool } from "../../src/tools/builtin/memory"

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

let executed: unknown[] = []
const countTool = tool({
  name: "count_to",
  description: "Counts to n",
  schema: z.object({ n: z.int().min(1).describe("Where to stop"), label: z.string().optional() }),
  execute: async args => {
    executed.push(args)
    return `counted to ${args.n}`
  }
})

async function turn(call: FakeCall) {
  executed = []
  const agent = new Agent({
    model: "m",
    client: fakeClient([{ content: null, calls: [call] }, { content: "Done." }]),
    tools: [countTool],
    promptContext: { environment: "test" }
  })
  const session = createSession()
  for await (const _ of run(agent, "count", session)) {
    // drain
  }
  return session.messages.find(m => m.role === "tool") as { content: string }
}

test("a zod tool's JSON Schema is what a hand-written one would be", () => {
  expect(countTool.definition).toEqual({
    type: "function",
    function: {
      name: "count_to",
      description: "Counts to n",
      parameters: {
        type: "object",
        properties: { n: { type: "integer", minimum: 1, description: "Where to stop" }, label: { type: "string" } },
        required: ["n"]
      }
    }
  })
})

test("arguments that don't fit the schema go back to the model instead of reaching execute", async () => {
  const reply = await turn({ id: "c1", name: "count_to", arguments: '{"n":"five"}' })
  expect(executed).toEqual([])
  expect(reply.content).toStartWith("Invalid arguments for count_to:")
  expect(reply.content).toContain("n")
})

test("valid arguments reach execute parsed, with unknown keys dropped", async () => {
  const reply = await turn({ id: "c1", name: "count_to", arguments: '{"n":3,"extra":true}' })
  expect(executed).toEqual([{ n: 3 }])
  expect(reply.content).toBe("counted to 3")
})

test("an approved call is checked too", async () => {
  executed = []
  expect(await runApprovedTool([countTool], "count_to", '{"n":0}')).toStartWith(
    "Error: Invalid arguments for count_to:"
  )
  expect(executed).toEqual([])
})

test("a built-in refuses a value outside its enum", () => {
  const checked = checkToolArgs(rememberNoteTool, { key: "k", content: "c", importance: "urgent" })
  expect(checked.ok).toBe(false)
  expect(checkToolArgs(rememberNoteTool, { key: "k", content: "c", importance: "high" })).toEqual({
    ok: true,
    args: { key: "k", content: "c", importance: "high" }
  })
})

test("a tool with an outside JSON Schema takes its arguments as they are", () => {
  const outside = tool<Record<string, unknown>>({
    name: "mcp_thing",
    description: "From an MCP server",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok"
  })
  expect(checkToolArgs(outside, { anything: 1 })).toEqual({ ok: true, args: { anything: 1 } })
})
