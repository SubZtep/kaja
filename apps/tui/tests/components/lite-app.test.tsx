import { afterEach, beforeEach, expect, test } from "bun:test"
import LiteApp from "../../components/layout/lite-app"
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
  return Response.json({ persona: { id: "default", label: "Helpful assistant" }, model: "test-model", tools: [] })
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
  const t = renderForTest(<LiteApp apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  await t.tick()
  expect(t.lastFrame()).toContain("Helpful assistant")
  expect(t.lastFrame()).toContain("test-model")
  t.unmount()
  await t.waitUntilExit()
})

test("sending a message streams the reply into the timeline", async () => {
  const t = renderForTest(<LiteApp apiUrl="https://api.kaja.io" token="tok" />)
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
  const t = renderForTest(<LiteApp apiUrl="https://api.kaja.io" token="tok" />)
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
  const t = renderForTest(<LiteApp apiUrl="https://api.kaja.io" token="tok" />)
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
