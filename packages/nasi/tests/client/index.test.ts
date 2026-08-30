import { afterEach, expect, test } from "bun:test"
import { createNasiClient, NasiStreamError } from "../../src/client"

let server: ReturnType<typeof Bun.serve> | undefined

afterEach(() => {
  server?.stop(true)
  server = undefined
})

function sseChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
        await new Promise(r => setTimeout(r, 0))
      }
      controller.close()
    }
  })
}

test("turn() posts and returns the parsed JSON response", async () => {
  server = Bun.serve({
    port: 0,
    fetch: async req => {
      expect(req.headers.get("authorization")).toBe("Bearer tok")
      const body = await req.json()
      expect(body.message).toBe("hi")
      return Response.json({
        session: "01900000-0000-7000-8000-000000000000",
        status: "completed",
        message: "hey",
        steps: []
      })
    }
  })
  const client = createNasiClient({ baseUrl: server.url.toString(), getToken: async () => "tok" })
  const result = await client.turn({ message: "hi" })
  expect(result.message).toBe("hey")
})

test("turn() throws with status and body on a non-ok response", async () => {
  server = Bun.serve({ port: 0, fetch: () => new Response("nope", { status: 401 }) })
  const client = createNasiClient({ baseUrl: server.url.toString(), getToken: async () => undefined })
  await expect(client.turn({ message: "hi" })).rejects.toThrow(/401/)
})

test("turn_stream() yields events split across chunk boundaries and returns done", async () => {
  // Deliberately split a single SSE block mid-line, and split between blocks too.
  const raw =
    'event: delta\ndata: {"type":"delta","channel":"content","text":"he' +
    'llo"}\n\nevent: final\ndata: {"type":"final","content":"hello"}\n\n' +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"completed"}\n\n'
  server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response(sseChunks([raw.slice(0, 40), raw.slice(40, 90), raw.slice(90)]), {
        headers: { "content-type": "text/event-stream" }
      })
  })
  const client = createNasiClient({ baseUrl: server.url.toString(), getToken: async () => undefined })

  const events: unknown[] = []
  const gen = client.turn_stream({ message: "hi" })
  let next = await gen.next()
  while (!next.done) {
    events.push(next.value)
    next = await gen.next()
  }

  expect(events).toEqual([
    { type: "delta", channel: "content", text: "hello" },
    { type: "final", content: "hello" }
  ])
  expect(next.value).toEqual({ session: "01900000-0000-7000-8000-000000000000", status: "completed" })
})

test("turn_stream() skips heartbeat comments", async () => {
  const raw =
    "event: heartbeat\ndata: \n\n" +
    'event: done\ndata: {"session":"01900000-0000-7000-8000-000000000000","status":"completed"}\n\n'
  server = Bun.serve({
    port: 0,
    fetch: () => new Response(sseChunks([raw]), { headers: { "content-type": "text/event-stream" } })
  })
  const client = createNasiClient({ baseUrl: server.url.toString(), getToken: async () => undefined })
  const gen = client.turn_stream({ message: "hi" })
  const next = await gen.next()
  expect(next.done).toBe(true)
})

test("turn_stream() throws NasiStreamError on a server error event", async () => {
  const raw = 'event: error\ndata: {"error":"Session not found"}\n\n'
  server = Bun.serve({
    port: 0,
    fetch: () => new Response(sseChunks([raw]), { headers: { "content-type": "text/event-stream" } })
  })
  const client = createNasiClient({ baseUrl: server.url.toString(), getToken: async () => undefined })
  const gen = client.turn_stream({ message: "hi" })
  await expect(gen.next()).rejects.toBeInstanceOf(NasiStreamError)
})
