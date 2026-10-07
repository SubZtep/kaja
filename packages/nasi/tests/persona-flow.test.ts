import { afterEach, expect, test } from "bun:test"
import type { Persona } from "@kaja/schema/cli"
import type { AbilityStore } from "../src/abilities/types"
import { Nasi } from "../src/nasi"
import { createMemoryStore } from "../src/store"
import { httpAbility, mcpAbility } from "./fixtures/abilities"
import { routeHostTo, startHttpMcpFixture } from "./fixtures/mcp-http-server"

type Round = { content: string | null; tool_calls?: unknown[] }
type Sent = { tools: string[]; messages: { role: string; content?: unknown; tool_call_id?: string }[] }

/** Plays `script`, one assistant message per model call, recording the tool names and messages each call was sent. */
function fakeClient(script: Round[], sent: Sent[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: { messages: Sent["messages"]; tools?: { function: { name: string } }[] }) => {
          sent.push({
            tools: (params.tools ?? []).map(tool => tool.function.name),
            messages: structuredClone(params.messages)
          })
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

const weather = httpAbility({
  name: "weather",
  description: "Weather",
  baseUrl: "https://api.weather.test",
  tools: [{ name: "forecast", description: "Forecast", path: "/f" }]
})
const things = mcpAbility({
  name: "things",
  description: "Things",
  transport: "http",
  url: "https://mcp.example.test/mcp",
  tools: ["read_thing", "write_thing"]
})
const store = (over: Partial<AbilityStore> = {}): AbilityStore => ({
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => [weather],
  listMcpAbilities: async () => [],
  ...over
})

const chatty: Persona = { id: "chatty", label: "Chatty" }
const forecaster: Persona = { id: "forecaster", label: "Forecaster", abilities: ["weather", "things"] }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

test("each round sends only the active persona's tools, and a switch_persona changes the next round's", async () => {
  const sent: Sent[] = []
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: {
      client: fakeClient(
        [{ content: null, tool_calls: [call("c1", "switch_persona", { persona: "forecaster" })] }, { content: "ok" }],
        sent
      ) as never,
      model: "fake"
    },
    personas: [chatty, forecaster],
    abilities: store()
  })
  try {
    await nasi.turnBuffered({ message: "what's the weather?" })
    expect(sent[0]!.tools).not.toContain("forecast")
    expect(sent[0]!.tools).toContain("switch_persona")
    expect(sent[1]!.tools).toContain("forecast")
  } finally {
    await nasi.close()
  }
})

test("a call to a tool the active persona doesn't have is refused with the reason", async () => {
  const sent: Sent[] = []
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: {
      client: fakeClient(
        [{ content: null, tool_calls: [call("c1", "forecast", {})] }, { content: "sorry" }],
        sent
      ) as never,
      model: "fake"
    },
    personas: [chatty, forecaster],
    abilities: store()
  })
  try {
    await nasi.turnBuffered({ message: "weather?" })
    expect(sent[1]!.messages.at(-1)).toMatchObject({
      role: "tool",
      tool_call_id: "c1",
      content: 'Error: "forecast" isn\'t available to the current persona (chatty).'
    })
  } finally {
    await nasi.close()
  }
})

test("an MCP ability connects only once a persona that lists it is active", async () => {
  const fixture = startHttpMcpFixture()
  globalThis.fetch = routeHostTo(fixture, "mcp.example.test", realFetch)
  const sent: Sent[] = []
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: {
      client: fakeClient(
        [
          { content: "hello" },
          { content: null, tool_calls: [call("c1", "switch_persona", { persona: "forecaster" })] },
          { content: null, tool_calls: [call("c2", "read_thing", { id: "7" })] },
          { content: "done" }
        ],
        sent
      ) as never,
      model: "fake"
    },
    personas: [chatty, forecaster],
    abilities: store({ listMcpAbilities: async () => [things] }),
    deps: { fetchProxy: "http://proxy.test:3128" }
  })
  try {
    const first = await nasi.turnBuffered({ message: "hi" })
    expect(fixture.initializations()).toBe(0)
    expect(sent[0]!.tools).not.toContain("read_thing")

    await nasi.turnBuffered({ session: first.session, message: "now the things" })
    expect(fixture.initializations()).toBeGreaterThan(0)
    expect(sent[2]!.tools).toContain("read_thing")
    expect(sent[3]!.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c2", content: "thing 7" })
  } finally {
    await nasi.close()
    fixture.stop()
  }
})

test("without personas, every ability's MCP server connects, as before", async () => {
  const fixture = startHttpMcpFixture()
  globalThis.fetch = routeHostTo(fixture, "mcp.example.test", realFetch)
  const sent: Sent[] = []
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: { client: fakeClient([{ content: "hi" }], sent) as never, model: "fake" },
    abilities: store({ listMcpAbilities: async () => [things] }),
    deps: { fetchProxy: "http://proxy.test:3128" }
  })
  try {
    await nasi.turnBuffered({ message: "hi" })
    expect(sent[0]!.tools).toEqual(expect.arrayContaining(["forecast", "read_thing", "write_thing"]))
  } finally {
    await nasi.close()
    fixture.stop()
  }
})
