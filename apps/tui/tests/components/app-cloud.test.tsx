import { afterEach, beforeEach, expect, test } from "bun:test"
import App from "../../src/components/layout/app"
import { renderForTest } from "../test-utils"

const originalFetch = globalThis.fetch

function sseResponse(text: string): Response {
  const body =
    `event: delta\ndata: {"type":"delta","channel":"content","text":${JSON.stringify(text)}}\n\n` +
    `event: final\ndata: {"type":"final","content":${JSON.stringify(text)}}\n\n` +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"completed"}\n\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

function infoResponse(): Response {
  return Response.json({
    persona: { id: "default", label: "Helpful assistant" },
    personas: [
      { id: "default", label: "Helpful assistant" },
      { id: "grumpy", label: "Grumpy Cat" }
    ],
    model: "test-model",
    tools: []
  })
}

function sseToolErrorResponse(): Response {
  const body =
    'event: tool_call\ndata: {"type":"tool_call","name":"fetch_url","arguments":"{}"}\n\n' +
    'event: error\ndata: {"error":"fetch_url: Blocked non-public URL: http://localhost/x","category":"tool"}\n\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

let nextTurnResponse: () => Response = () => sseResponse("hello from lite")
let lastTurnBody: Record<string, unknown> | undefined

beforeEach(() => {
  nextTurnResponse = () => sseResponse("hello from lite")
  lastTurnBody = undefined
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = typeof url === "string" ? url : url instanceof URL ? url.pathname : new URL(url.url).pathname
    if (path.endsWith("/nasi/info")) return infoResponse()
    if (path.endsWith("/nasi/turn/stream") && typeof init?.body === "string") lastTurnBody = JSON.parse(init.body)
    return nextTurnResponse()
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("renders the resolved persona label and model from /nasi/info", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Helpful assistant")
  expect(t.lastFrame()).toContain("Test Model")
  t.unmount()
  await t.waitUntilExit()
})

test("the key line shows scrolling, help, persona and Esc; copy is left to the help screen", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  const frame = t.lastFrame()
  expect(frame).toContain("PgUp/PgDn scroll · Alt+L help · Alt+P persona · Esc quit")
  expect(frame).not.toContain("Alt+R")
  // Nothing on screen is longer than the code preview, so there is no Expand button (and no hotkey behind it)
  expect(frame).not.toContain("expand")
  t.unmount()
  await t.waitUntilExit()
})

test("the key bar's Esc entry becomes Close while the persona picker is open", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("quit")

  await t.press("\x1bp") // Alt+P opens the persona picker
  const frame = t.lastFrame()
  expect(frame).toContain("Choose a persona")
  expect(frame).toContain("close")
  expect(frame).not.toContain("quit")

  t.unmount()
  await t.waitUntilExit()
})

test("help opens a modal that blocks typing, and Esc closes it without quitting", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()

  await t.press("\x1bl") // Alt+L
  expect(t.lastFrame()).toContain("Switch persona")

  await t.press("zzz")
  await t.press("\x1b")
  expect(t.lastFrame()).not.toContain("Switch persona")
  expect(t.lastFrame()).not.toContain("zzz")
  expect(t.lastFrame()).toContain("quit")

  await t.press("abc")
  expect(t.lastFrame()).toContain("abc")

  t.unmount()
  await t.waitUntilExit()
})

test("sending a message streams the reply into the timeline", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.press("hi there")
  await t.press("\r")
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("hello from lite")
  t.unmount()
  await t.waitUntilExit()
})

test("sends the CLI's active language with the turn request", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.press("hi there")
  await t.press("\r")
  await t.tick()
  await t.tick()
  expect(lastTurnBody?.language).toBe("en-GB")
  t.unmount()
  await t.waitUntilExit()
})

test("a tool error from the server renders as a tool failure, not a network error", async () => {
  nextTurnResponse = () => sseToolErrorResponse()
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.press("fetch that")
  await t.press("\r")
  await t.tick()
  await t.tick()
  const frame = t.lastFrame()
  expect(frame).toContain("Tool failed")
  expect(frame).not.toContain("Network error")
  expect(frame).toContain("fetch_url: Blocked non-public URL: http://localhost/x")
  t.unmount()
  await t.waitUntilExit()
})

test('hotkeyModifier: "ctrl" in preferences switches the persona-picker hotkey to Ctrl+P', async () => {
  const t = renderForTest(
    <App mode="cloud" apiUrl="https://api.kaja.io" token="tok" initialPreferences={{ hotkeyModifier: "ctrl" }} />
  )
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Ctrl+P")

  await t.press("\x1bp") // Alt+P — wrong modifier now, must not open the picker
  expect(t.lastFrame()).not.toContain("Grumpy Cat")

  await t.press("\x10") // Ctrl+P
  expect(t.lastFrame()).toContain("Grumpy Cat")

  t.unmount()
  await t.waitUntilExit()
})

test("Alt+P opens the persona picker, and picking a persona resets the session and pins personaId", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Helpful assistant")

  await t.press("\x1bp")
  expect(t.lastFrame()).toContain("Grumpy Cat")

  await t.press("\x1b[B")
  await t.press("\r")
  expect(t.lastFrame()).toContain("Grumpy Cat")
  expect(t.lastFrame()).not.toContain("Helpful assistant")

  await t.press("hi there")
  await t.press("\r")
  await t.tick()
  await t.tick()
  expect(lastTurnBody?.personaId).toBe("grumpy")
  expect(lastTurnBody?.session).toBeUndefined()

  t.unmount()
  await t.waitUntilExit()
})

function ssePersonaSwitchResponse(): Response {
  const body =
    'event: persona_switch\ndata: {"type":"persona_switch","personaId":"grumpy","label":"Grumpy Cat"}\n\n' +
    'event: final\ndata: {"type":"final","content":"Hmph."}\n\n' +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"completed"}\n\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

test("when the model switches persona, the header shows it and the next turn asks for it", async () => {
  nextTurnResponse = ssePersonaSwitchResponse
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.press("I'm grumpy today")
  await t.press("\r")
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Grumpy Cat")

  nextTurnResponse = () => sseResponse("still grumpy")
  await t.press("and now?")
  await t.press("\r")
  await t.tick()
  await t.tick()
  expect(lastTurnBody?.personaId).toBe("grumpy")
  expect(lastTurnBody?.session).toBe("01900000-0000-7000-8000-000000000000")
  t.unmount()
  await t.waitUntilExit()
})

test("yolo approves a cloud tool approval itself and carries on, without showing the question", async () => {
  const bodies: Record<string, unknown>[] = []
  const approvalTurn = () => {
    const body =
      'event: confirm_tool\ndata: {"type":"confirm_tool","id":"c1","name":"create_issue","arguments":"{}","summary":"POST /issues"}\n\n' +
      'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"needs_approval"}\n\n'
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        }
      }),
      { headers: { "content-type": "text/event-stream" } }
    )
  }
  nextTurnResponse = () => (bodies.length === 1 ? approvalTurn() : sseResponse("issue filed"))
  const fetchWithBodies = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (
      typeof init?.body === "string" &&
      (url instanceof Request ? url.url : String(url)).endsWith("/nasi/turn/stream")
    )
      bodies.push(JSON.parse(init.body))
    return fetchWithBodies(url, init)
  }) as typeof fetch

  const t = renderForTest(
    <App mode="cloud" apiUrl="https://api.kaja.io" token="tok" initialPreferences={{ yolo: true }} />
  )
  await t.tick()
  await t.press("file it")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()

  expect(bodies.map(body => body.approval)).toEqual([undefined, "approve"])
  expect(t.lastFrame()).toContain("issue filed")
  expect(t.lastFrame()).not.toContain("POST /issues")
  expect(t.lastFrame()).toContain("YOLO")

  t.unmount()
  await t.waitUntilExit()
})

/** A cloud turn that pauses for `read_file` on this computer, with the computer's `approve` recorded in `ran`. */
function mountPausedComputer() {
  const bodies: Record<string, unknown>[] = []
  const pausedTurn = () => {
    const body =
      'event: client_tool_calls\ndata: {"type":"client_tool_calls","calls":[{"id":"c1","name":"read_file","arguments":"{\\"path\\":\\"/etc/hostname\\"}"}]}\n\n' +
      'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"needs_client_tool"}\n\n'
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body))
          controller.close()
        }
      }),
      { headers: { "content-type": "text/event-stream" } }
    )
  }
  nextTurnResponse = () => (bodies.length === 1 ? pausedTurn() : sseResponse("your host is kaja"))
  const fetchWithBodies = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (
      typeof init?.body === "string" &&
      (url instanceof Request ? url.url : String(url)).endsWith("/nasi/turn/stream")
    )
      bodies.push(JSON.parse(init.body))
    return fetchWithBodies(url, init)
  }) as typeof fetch

  const ran: { name: string; answer: boolean | { feedback: string } }[] = []
  const computer = {
    tools: [{ name: "read_file", description: "Reads a file", parameters: { type: "object" } }],
    skills: [],
    personas: [],
    run: async (
      call: { id: string; name: string },
      approve: (request: { kind: "tool"; name: string; summary: string }) => Promise<boolean | { feedback: string }>
    ) => {
      const answer = await approve({ kind: "tool", name: call.name, summary: "read /etc/hostname" })
      ran.push({ name: call.name, answer })
      return { id: call.id, text: answer === true ? "kaja" : "User declined this request." }
    },
    close: async () => {}
  }
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" computer={computer} />)
  return { t, bodies, ran, computer }
}

test("a turn waiting on this computer runs the call here, asking first, and resumes with its result", async () => {
  const { t, bodies, ran, computer } = mountPausedComputer()
  await t.tick()
  await t.press("what's my hostname?")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(t.lastFrame()).toContain("read_file wants to send this request")
  expect(t.lastFrame()).not.toContain("read /etc/hostname")

  await t.press("\x1bo") // Alt+O: the request, in a modal
  expect(t.lastFrame()).toContain("read /etc/hostname")
  await t.press("\x1b")
  expect(t.lastFrame()).not.toContain("read /etc/hostname")

  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(ran).toEqual([{ name: "read_file", answer: true }])
  expect(bodies[0]?.clientTools).toEqual(computer.tools)
  expect(bodies[1]?.toolResults).toEqual([{ id: "c1", text: "kaja" }])
  expect(bodies[1]?.message).toBeUndefined()
  expect(t.lastFrame()).toContain("your host is kaja")

  t.unmount()
  await t.waitUntilExit()
})

test("writing instead of answering declines the call here and shows what was written", async () => {
  const { t, ran } = mountPausedComputer()
  await t.tick()
  await t.press("what's my hostname?")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()

  expect(t.lastFrame()).toContain("Esc decline")
  await t.press("use hostnamectl")
  expect(t.lastFrame()).toContain("Esc clear")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(ran).toEqual([{ name: "read_file", answer: { feedback: "use hostnamectl" } }])
  expect(t.output()).toContain("use hostnamectl")

  t.unmount()
  await t.waitUntilExit()
})

test("a question from the agent's ask_user tool changes the input's hint to an answer's", async () => {
  const body =
    'event: ask_user\ndata: {"type":"ask_user","question":"Which one?","fromTool":true}\n\n' +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"needs_input"}\n\n'
  nextTurnResponse = () => new Response(body, { headers: { "content-type": "text/event-stream" } })
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  expect(t.lastFrame()).toContain("Type something")
  await t.press("pick one")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(t.lastFrame()).toContain("Which one?")
  expect(t.lastFrame()).toContain("Type your answer")

  t.unmount()
  await t.waitUntilExit()
})

/** A turn that asks "Proceed?" with options, then answers whatever comes back with "ok". */
function mountQuestionWithOptions() {
  const bodies: Record<string, unknown>[] = []
  const asked =
    'event: ask_user\ndata: {"type":"ask_user","question":"Proceed?","options":["Yes","No"],"fromTool":true}\n\n' +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"needs_input"}\n\n'
  nextTurnResponse = () =>
    bodies.length === 1 ? new Response(asked, { headers: { "content-type": "text/event-stream" } }) : sseResponse("ok")
  const fetchWithBodies = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (
      typeof init?.body === "string" &&
      (url instanceof Request ? url.url : String(url)).endsWith("/nasi/turn/stream")
    )
      bodies.push(JSON.parse(init.body))
    return fetchWithBodies(url, init)
  }) as typeof fetch
  return { t: renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />), bodies }
}

async function askWithOptions(t: ReturnType<typeof renderForTest>) {
  await t.tick()
  await t.press("deploy")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
}

test("a question with options lists them beside the field, and picking one sends its text", async () => {
  const { t, bodies } = mountQuestionWithOptions()
  await askWithOptions(t)
  expect(t.lastFrame()).toContain("Proceed?")
  expect(t.lastFrame()).toContain("Yes")
  expect(t.lastFrame()).toContain("Or type your own answer")

  await t.press("\x1b[B") // down to "No"
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(bodies[1]?.message).toBe("No")
  expect(t.lastFrame()).toContain("ok")

  t.unmount()
  await t.waitUntilExit()
})

test("typing beside a question's options answers with the typed text", async () => {
  const { t, bodies } = mountQuestionWithOptions()
  await askWithOptions(t)

  await t.press("only staging")
  await t.press("\r")
  for (let i = 0; i < 4; i++) await t.tick()
  expect(bodies[1]?.message).toBe("only staging")

  t.unmount()
  await t.waitUntilExit()
})

test("Esc beside a question's options empties the typed text without quitting, and quits from the empty list", async () => {
  const { t } = mountQuestionWithOptions()
  await askWithOptions(t)

  expect(t.lastFrame()).toContain("Esc quit")
  await t.press("only")
  expect(t.lastFrame()).toContain("Esc clear")
  await t.press("\x1b")
  expect(t.lastFrame()).not.toContain("only")
  expect(t.lastFrame()).toContain("Yes") // still here: nothing quit
  expect(t.lastFrame()).toContain("Esc quit")

  t.unmount()
  await t.waitUntilExit()
})
