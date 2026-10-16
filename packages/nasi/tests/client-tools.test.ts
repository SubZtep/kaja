import { expect, test } from "bun:test"
import { answerClientCalls, CLIENT_GONE } from "../src/abilities/client"
import type { AbilityStore } from "../src/abilities/types"
import type { Session } from "../src/agent/agent"
import { Nasi, type NasiOpenOptions } from "../src/nasi"
import { createMemoryStore } from "../src/store"
import { mcpAbility } from "./fixtures/abilities"
import { TINY_PNG_BASE64 } from "./fixtures/images"

type SentMessage = { role: string; content?: unknown; tool_call_id?: string }
type Sent = { messages: SentMessage[]; tools?: { function: { name: string } }[] }

function fakeClient(script: { content: string | null; tool_calls?: unknown[] }[], sent: Sent[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: Sent) => {
          sent.push(structuredClone(params))
          const message = script[i++]
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

const call = (id: string, name: string, args: object) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) }
})

const readFile = {
  name: "read_file",
  description: "Reads a file on the user's computer",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
}

function open(script: Parameters<typeof fakeClient>[0], sent: Sent[], extra?: Partial<NasiOpenOptions>) {
  return Nasi.open({
    store: extra?.store ?? createMemoryStore(),
    chat: { client: fakeClient(script, sent) as never, model: "fake" },
    client: { tools: [readFile], skills: [] },
    ...extra
  })
}

test("a round's client calls pause the turn together, and their results resume it", async () => {
  const sent: Sent[] = []
  const store = createMemoryStore()
  const script = [
    { content: null, tool_calls: [call("c1", "read_file", { path: "/a" }), call("c2", "read_file", { path: "/b" })] },
    { content: "Both read." }
  ]
  const first = await (await open(script, sent, { store })).turnBuffered({ message: "read them" })
  expect(sent[0]!.tools?.map(t => t.function.name)).toContain("read_file")
  expect(first.status).toBe("needs_client_tool")
  expect(first.steps.find(step => step.type === "client_tool_calls")).toEqual({
    type: "client_tool_calls",
    calls: [
      { id: "c1", name: "read_file", arguments: '{"path":"/a"}' },
      { id: "c2", name: "read_file", arguments: '{"path":"/b"}' }
    ]
  })

  // A later turn opens its own instance, as the API does.
  const second = await (await open(script.slice(1), sent, { store })).turnBuffered({
    session: first.session,
    toolResults: [
      { id: "c1", text: "alpha" },
      { id: "c2", text: "beta", images: [{ data: TINY_PNG_BASE64, mimeType: "image/png" }] }
    ]
  })
  expect(second.status).toBe("completed")
  expect(second.message).toBe("Both read.")
  const resumed = sent.at(-1)!.messages
  expect(resumed.filter(m => m.role === "tool").map(m => [m.tool_call_id, m.content])).toEqual([
    ["c1", "alpha"],
    ["c2", "beta"]
  ])
  expect(JSON.stringify(resumed.at(-1))).toContain(`data:image/png;base64,${TINY_PNG_BASE64}`)
})

test("a message instead of results answers the waiting calls as gone, then goes on", async () => {
  const sent: Sent[] = []
  const store = createMemoryStore()
  const script = [{ content: null, tool_calls: [call("c1", "read_file", { path: "/a" })] }, { content: "Never mind." }]
  const first = await (await open(script, sent, { store })).turnBuffered({ message: "read it" })
  const second = await (await open(script.slice(1), sent, { store })).turnBuffered({
    session: first.session,
    message: "forget it"
  })
  expect(second.status).toBe("completed")
  const resumed = sent.at(-1)!.messages
  expect(resumed.find(m => m.tool_call_id === "c1")?.content).toBe(CLIENT_GONE)
  expect(resumed.at(-1)).toEqual({ role: "user", content: "forget it" })
})

test("the cloud's copy of an ability the client declares is left out, and load_skill asks the client for its skills", async () => {
  const sent: Sent[] = []
  const store: AbilityStore = {
    listSkills: async () => [
      { name: "cloud-skill", description: "From the cloud", files: [] },
      { name: "browser", description: "The cloud's copy", files: [] }
    ],
    readSkill: async name => `body of ${name}`,
    listHttpTools: async () => [],
    listMcpAbilities: async () => [
      mcpAbility({
        name: "browser",
        description: "Browser",
        transport: "http",
        url: "https://browser.example/mcp",
        tools: ["navigate"]
      })
    ]
  }
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: {
      client: fakeClient(
        [{ content: null, tool_calls: [call("s1", "load_skill", { name: "browser" })] }, { content: "ok" }],
        sent
      ) as never,
      model: "fake"
    },
    abilities: store,
    client: {
      tools: [{ ...readFile, name: "navigate", ability: "browser" }],
      skills: [{ name: "browser", description: "Mine", files: [] }]
    }
  })
  const result = await nasi.turnBuffered({ message: "browse" })
  const system = String(sent[0]!.messages[0]!.content)
  expect(system).toContain("Mine")
  expect(system).not.toContain("The cloud's copy")
  expect(result.status).toBe("needs_client_tool")
  expect(result.steps.find(step => step.type === "client_tool_calls")).toMatchObject({
    calls: [{ name: "load_skill" }]
  })
  await nasi.close()
})

test("each answered call's status goes into telemetry as the client reports it; an unanswered one is skipped", () => {
  const session: Session = { messages: [], pendingClientCalls: ["a", "b", "c", "d"] }
  answerClientCalls(session, [
    { id: "a", text: "fine" },
    { id: "b", text: "Error: no such file", status: "error" },
    { id: "c", text: "User declined this request.", status: "declined" }
  ])
  expect(session.telemetry?.calls).toEqual({
    a: { status: "ok" },
    b: { status: "error" },
    c: { status: "declined", approval: "declined" },
    d: { status: "skipped" }
  })
})
