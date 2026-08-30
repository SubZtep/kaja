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

beforeEach(() => {
  globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) =>
    sseResponse("hello from lite")) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("renders the startup panel with the configured API URL", async () => {
  const t = renderForTest(<LiteApp apiUrl="https://api.kaja.io" token="tok" />)
  await t.tick()
  expect(t.lastFrame()).toContain("api.kaja.io")
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
