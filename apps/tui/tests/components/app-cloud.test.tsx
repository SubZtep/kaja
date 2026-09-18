import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setToolDeps } from "@kaja/nasi"
import App from "../../components/layout/app"
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

test("the key bar shows Esc, Help, Persona, and Copy", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  const frame = t.lastFrame()
  expect(frame).toContain("Esc")
  expect(frame).toContain("Quit")
  expect(frame).toContain("Alt+L")
  expect(frame).toContain("Help")
  expect(frame).toContain("Alt+P")
  expect(frame).toContain("Persona")
  expect(frame).toContain("Alt+R")
  expect(frame).toContain("Copy")
  t.unmount()
  await t.waitUntilExit()
})

test("the key bar's Esc entry becomes Cancel while the persona picker is open", async () => {
  const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Quit")

  await t.press("\x1bp") // Alt+P opens the persona picker
  const frame = t.lastFrame()
  expect(frame).toContain("Cancel")
  expect(frame).not.toContain("Quit")

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

function sseClientToolCallResponse(name: string, args: Record<string, unknown>): Response {
  const body =
    `event: client_tool_call\ndata: {"type":"client_tool_call","name":${JSON.stringify(name)},"arguments":${JSON.stringify(JSON.stringify(args))}}\n\n` +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"needs_client_tool"}\n\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

test("a client_tool_call pause reads the local file and resumes the turn automatically", async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "kaja-cloud-tool-test-"))
  writeFileSync(join(workspaceRoot, "notes.txt"), "hello from disk")
  setToolDeps({ workspaceRoot })

  let responseIndex = 0
  nextTurnResponse = () => {
    responseIndex++
    return responseIndex === 1
      ? sseClientToolCallResponse("read_file", { path: "notes.txt" })
      : sseResponse("it says hello from disk")
  }

  try {
    const t = renderForTest(<App mode="cloud" apiUrl="https://api.kaja.io" token="tok" />)
    await t.tick()
    await t.press("what does notes.txt say?")
    await t.press("\r")
    await t.tick()
    await t.tick()
    await t.tick()
    expect(lastTurnBody?.message).toBe("hello from disk")
    expect(t.lastFrame()).toContain("it says hello from disk")
    t.unmount()
    await t.waitUntilExit()
  } finally {
    setToolDeps({})
    rmSync(workspaceRoot, { recursive: true, force: true })
  }
})
