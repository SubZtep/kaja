import { afterEach, expect, test } from "bun:test"
import { HttpToolAbilitySchema, McpAbilitySchema } from "@kaja/schema/abilities"
import type { AbilityStore } from "../src/abilities/types"
import { createSession } from "../src/agent/agent"
import { dropImages } from "../src/agent/run"
import { Nasi, type NasiOpenOptions } from "../src/nasi"
import { createMemoryStore } from "../src/store"
import { routeHostTo, startHttpMcpFixture } from "./fixtures/mcp-http-server"

type SentMessage = { role: string; content?: unknown; tool_call_id?: string }

function fakeClient(script: { content: string | null; tool_calls?: unknown[] }[], sent?: SentMessage[][]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: { messages: SentMessage[] }) => {
          sent?.push(structuredClone(params.messages))
          const message = script[i++]
          if (!message) throw new Error("script exhausted")
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", ...message } }]
            })
          }
        }
      }
    }
  }
}

function open(
  script: { content: string | null; tool_calls?: unknown[] }[],
  extra?: Partial<NasiOpenOptions>,
  sent?: SentMessage[][]
) {
  return Nasi.open({
    store: extra?.store ?? createMemoryStore(),
    chat: { client: fakeClient(script, sent) as never, model: "fake" },
    ...extra
  })
}

test("ask_user tool yields needs_input and the next message binds as a tool result", async () => {
  const nasi = await open([
    {
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "ask_user", arguments: JSON.stringify({ question: "Favorite color?" }) }
        }
      ]
    },
    { content: "Noted, blue." }
  ])

  const first = await nasi.turnBuffered({ message: "hi" })
  expect(first.status).toBe("needs_input")
  expect(first.message).toBe("Favorite color?")
  expect(first.session).toBeTruthy()

  const second = await nasi.turnBuffered({ session: first.session, message: "blue" })
  expect(second.status).toBe("completed")
  expect(second.message).toBe("Noted, blue.")
})

test("read_file yields needs_client_tool in cloud mode, and the next message binds as its tool result", async () => {
  const nasi = await open([
    {
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "read_file", arguments: JSON.stringify({ path: "notes.txt" }) }
        }
      ]
    },
    { content: "The file says hello." }
  ])

  const first = await nasi.turnBuffered({ message: "what does notes.txt say?" })
  expect(first.status).toBe("needs_client_tool")
  expect(first.steps).toContainEqual({ type: "client_tool_call", name: "read_file", arguments: '{"path":"notes.txt"}' })
  expect(first.session).toBeTruthy()

  const second = await nasi.turnBuffered({ session: first.session, message: "hello" })
  expect(second.status).toBe("completed")
  expect(second.message).toBe("The file says hello.")
})

test("personaId on the request re-resolves the active persona every turn, including on a resumed session", async () => {
  const personaA = { id: "a", label: "A", instructions: "You are A" }
  const personaB = { id: "b", label: "B", instructions: "You are B" }
  const store = createMemoryStore()
  const nasi = await open([{ content: "first reply" }, { content: "second reply" }], {
    store,
    personas: [personaA, personaB]
  })

  const first = await nasi.turnBuffered({ message: "hi" })
  expect((await store.loadSession(first.session))?.persona).toBe("a")

  const second = await nasi.turnBuffered({ session: first.session, message: "hi again", personaId: "b" })
  expect(second.status).toBe("completed")
  // Without personaId threaded through every turn, loadTurn() would silently re-resolve personas[0] ("a") here instead.
  expect((await store.loadSession(second.session))?.persona).toBe("b")
})

test("a resumed session without personaId keeps the persona the model switched to", async () => {
  const personaA = { id: "a", label: "A", instructions: "You are A", when: "anything" }
  const personaB = { id: "b", label: "B", instructions: "You are B", when: "games" }
  const store = createMemoryStore()
  const sent: SentMessage[][] = []
  const switchToB = {
    id: "call_1",
    type: "function",
    function: { name: "switch_persona", arguments: JSON.stringify({ persona: "b" }) }
  }
  const nasi = await open(
    [{ content: null, tool_calls: [switchToB] }, { content: "now B" }, { content: "still B" }],
    { store, personas: [personaA, personaB] },
    sent
  )

  const first = await nasi.turnBuffered({ message: "let's play" })
  expect((await store.loadSession(first.session))?.persona).toBe("b")

  await nasi.turnBuffered({ session: first.session, message: "again" })
  expect((await store.loadSession(first.session))?.persona).toBe("b")
  expect(String(sent.at(-1)![0]!.content)).toContain("You are B")
})

test("plain question mark final is completed, not needs_input", async () => {
  const nasi = await open([{ content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
})

test("leaked tool-call closing tags are stripped from the final message", async () => {
  const nasi = await open([{ content: "It's a cat! Want to go another round? </parameter> </invoke> </invoke>" }])
  const result = await nasi.turnBuffered({ message: "yes" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("It's a cat! Want to go another round?")
})

test("turn() streams delta events live and returns the same response turnBuffered would", async () => {
  const nasi = await open([{ content: "streamed reply" }])

  const seen: string[] = []
  const gen = nasi.turn({ message: "hi" })
  let next = await gen.next()
  while (!next.done) {
    seen.push(next.value.type)
    next = await gen.next()
  }

  expect(seen).toContain("delta")
  expect(seen).toContain("final")
  expect(next.value.status).toBe("completed")
  expect(next.value.message).toBe("streamed reply")
  expect(next.value.session).toBeTruthy()
})

test("turn() isolates concurrent streamed turns from different users' stores", async () => {
  const nasiA = await open([{ content: "A-reply" }])
  const nasiB = await open([{ content: "B-reply" }])

  async function drain(gen: AsyncGenerator<unknown, { message: string }, void>) {
    let next = await gen.next()
    while (!next.done) next = await gen.next()
    return next.value
  }

  const [resultA, resultB] = await Promise.all([
    drain(nasiA.turn({ message: "hi" })),
    drain(nasiB.turn({ message: "hi" }))
  ])
  expect(resultA.message).toBe("A-reply")
  expect(resultB.message).toBe("B-reply")
})

test("an empty round is retried with a nudge instead of surfacing a blank final message", async () => {
  const nasi = await open([{ content: null }, { content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
})

test("a fallback message is shown, never a blank reply, after exhausting retries", async () => {
  const nasi = await open(Array(6).fill({ content: null }))
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).not.toBe("")
  expect(result.message.length).toBeGreaterThan(0)
})

test("a session id cannot be resumed by a different owner sharing the same store", async () => {
  const store = createMemoryStore()
  const nasiOwnerA = await open([{ content: "reply for A" }], { store, owner: "widget:key1:visitorA" })
  const first = await nasiOwnerA.turnBuffered({ message: "hi" })
  expect(first.status).toBe("completed")

  const nasiOwnerB = await open([{ content: "should not be reached" }], { store, owner: "widget:key1:visitorB" })
  await expect(nasiOwnerB.turnBuffered({ session: first.session, message: "hijack attempt" })).rejects.toThrow()
})

// A cloud user's HTTP tool with a key; a proxy is set so the (faked) request skips the DNS check.
const issuesAbility = HttpToolAbilitySchema.parse({
  name: "issues",
  description: "Issue tracker",
  baseUrl: "https://api.issues.test",
  auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " },
  tools: [
    {
      name: "create_issue",
      description: "File an issue",
      method: "POST",
      path: "/issues",
      parameters: { type: "object", properties: { title: { type: "string" } } }
    }
  ]
})

const abilities: AbilityStore = {
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => [issuesAbility],
  listMcpAbilities: async () => []
}

const createIssueCall = {
  id: "call_issue",
  type: "function",
  function: { name: "create_issue", arguments: JSON.stringify({ title: "Bug" }) }
}

const realFetch = globalThis.fetch
let requests: { url: string; method?: string; headers: Headers; body?: string }[] = []

/** Answers every request like the issue tracker would, and records it. */
function fakeIssueTracker() {
  requests = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body as string
    })
    return new Response('{"id":7}', { status: 201, headers: { "content-type": "application/json" } })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

function openWithIssues(script: { content: string | null; tool_calls?: unknown[] }[], sent: SentMessage[][]) {
  fakeIssueTracker()
  return open(
    script,
    {
      abilities,
      abilityKey: name => (name === "issues" ? "user-key" : undefined),
      deps: { fetchProxy: "http://proxy.test:3128" }
    },
    sent
  )
}

test("a tool that asks first pauses the turn; approving runs the call the session saved, with the user's key", async () => {
  const sent: SentMessage[][] = []
  const nasi = await openWithIssues([{ content: null, tool_calls: [createIssueCall] }, { content: "Filed #7." }], sent)

  const first = await nasi.turnBuffered({ message: "file a bug" })
  expect(first.status).toBe("needs_approval")
  const confirm = first.steps.find(step => step.type === "confirm_tool")
  expect(confirm).toMatchObject({ name: "create_issue", arguments: '{"title":"Bug"}' })
  expect(confirm?.type === "confirm_tool" && confirm.summary).toBe(
    'POST https://api.issues.test/issues {"title":"Bug"}'
  )
  expect(JSON.stringify(first)).not.toContain("user-key")
  expect(requests).toEqual([])

  const second = await nasi.turnBuffered({ session: first.session, approval: "approve" })
  expect(second).toMatchObject({ status: "completed", message: "Filed #7." })
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ url: "https://api.issues.test/issues", method: "POST", body: '{"title":"Bug"}' })
  expect(requests[0]!.headers.get("authorization")).toBe("Bearer user-key")
  expect(sent[1]!.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_issue", content: 'HTTP 201\n\n{"id":7}' })
})

test("declining skips the call, and so does writing a message instead", async () => {
  const sent: SentMessage[][] = []
  const nasi = await openWithIssues(
    [
      { content: null, tool_calls: [createIssueCall] },
      { content: "Okay, not filed." },
      { content: null, tool_calls: [createIssueCall] },
      { content: "Understood." }
    ],
    sent
  )

  const declined = await nasi.turnBuffered({ message: "file a bug" })
  await nasi.turnBuffered({ session: declined.session, approval: "decline" })
  expect(sent[1]!.at(-1)).toMatchObject({ role: "tool", content: "User declined this request." })

  const again = await nasi.turnBuffered({ session: declined.session, message: "try again" })
  expect(again.status).toBe("needs_approval")
  await nasi.turnBuffered({ session: again.session, message: "never mind" })
  expect(sent[3]!.at(-1)).toMatchObject({
    role: "tool",
    content: "Not run: the user didn't approve it and wrote instead: never mind"
  })
  expect(requests).toEqual([])
})

test("an approval with nothing waiting for one is refused", async () => {
  const nasi = await open([{ content: "hi" }])
  const first = await nasi.turnBuffered({ message: "hello" })
  await expect(nasi.turnBuffered({ session: first.session, approval: "approve" })).rejects.toMatchObject({
    name: "NasiNothingToApprove"
  })
})

test("a cloud user's MCP ability connects with their key when the turn opens; a write waits for approval", async () => {
  const fixture = startHttpMcpFixture({ apiKey: "mcp-key" })
  // The guarded fetch goes through the proxy, which here hands the fake host to the local fixture.
  globalThis.fetch = routeHostTo(fixture, "mcp.example.test", realFetch)
  const things = McpAbilitySchema.parse({
    name: "things",
    description: "Things",
    transport: "http",
    url: "https://mcp.example.test/mcp",
    auth: { type: "apiKey", in: "header", name: "Authorization", prefix: "Bearer " },
    approval: "writes",
    tools: ["read_thing", "write_thing"]
  })
  const call = (id: string, name: string, args: object) => ({
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) }
  })
  const sent: SentMessage[][] = []
  const nasi = await open(
    [
      { content: null, tool_calls: [call("c1", "read_thing", { id: "1" })] },
      { content: null, tool_calls: [call("c2", "write_thing", { id: "2" })] },
      { content: "Done." }
    ],
    {
      abilities: { ...abilities, listHttpTools: async () => [], listMcpAbilities: async () => [things] },
      abilityKey: name => (name === "things" ? "mcp-key" : undefined),
      deps: { fetchProxy: "http://proxy.test:3128" }
    },
    sent
  )
  try {
    const first = await nasi.turnBuffered({ message: "read one, write two" })
    expect(first.status).toBe("needs_approval")
    expect(sent[1]!.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1", content: "thing 1" })
    expect(first.steps).toContainEqual(expect.objectContaining({ type: "confirm_tool", name: "write_thing" }))

    const second = await nasi.turnBuffered({ session: first.session, approval: "approve" })
    expect(second.message).toBe("Done.")
    expect(sent[2]!.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c2", content: "wrote 2" })
  } finally {
    await nasi.close()
    fixture.stop()
  }
})

const PHOTO = "data:image/png;base64,iVBORw0KGgo="

test("a turn's images reach the model with its text, and history shows them as a photo", async () => {
  const sent: SentMessage[][] = []
  const store = createMemoryStore()
  const nasi = await open(
    [
      {
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "ask_user", arguments: '{"question":"Which one?"}' } }
        ]
      },
      { content: "A cat." },
      { content: "Also a cat." }
    ],
    { store },
    sent
  )

  const first = await nasi.turnBuffered({ message: "what is this?", images: [PHOTO] })
  expect(sent[0]!.at(-1)).toEqual({
    role: "user",
    content: [
      { type: "text", text: "what is this?" },
      { type: "image_url", image_url: { url: PHOTO } }
    ]
  })
  const row = await store.loadSession(first.session)
  expect(row!.title).toBe("📷 what is this?")
  expect(row!.events[0]).toEqual({ type: "user", text: "📷 what is this?" })

  // An answer goes back as the question's tool result, so its photo follows as its own user message
  await nasi.turnBuffered({ session: first.session, message: "", images: [PHOTO] })
  expect(sent[1]!.slice(-2)).toEqual([
    { role: "tool", tool_call_id: "call_1", content: "" },
    { role: "user", content: [{ type: "image_url", image_url: { url: PHOTO } }] }
  ])
})

test("dropImages leaves a note where a failed turn's images were", async () => {
  const session = createSession()
  session.messages.push({ role: "user", content: "earlier" })
  session.messages.push({
    role: "user",
    content: [
      { type: "text", text: "look" },
      { type: "image_url", image_url: { url: PHOTO } }
    ]
  })
  dropImages(session, 1)
  expect(session.messages[1]!.content).toEqual([
    { type: "text", text: "look" },
    { type: "text", text: "[The user sent an image here, but this model can't view images.]" }
  ])
})
