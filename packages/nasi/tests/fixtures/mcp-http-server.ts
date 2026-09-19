// A tiny Streamable HTTP MCP server for tests, on a local port: a read-only tool, one that writes, one that returns an image, one with a long answer.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import * as z from "zod"

function fixtureServer() {
  const server = new McpServer({ name: "http-fixture", version: "1.0.0" })
  server.registerTool(
    "read_thing",
    { description: "Reads a thing", inputSchema: { id: z.string() }, annotations: { readOnlyHint: true } },
    async ({ id }) => ({ content: [{ type: "text", text: `thing ${id}` }] })
  )
  server.registerTool(
    "write_thing",
    { description: "Writes a thing", inputSchema: { id: z.string() } },
    async ({ id }) => ({ content: [{ type: "text", text: `wrote ${id}` }] })
  )
  server.registerTool(
    "picture",
    { description: "Returns a picture", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ({
      content: [
        { type: "text", text: "a picture" },
        { type: "image", data: Buffer.from("png").toString("base64"), mimeType: "image/png" }
      ]
    })
  )
  server.registerTool(
    "long_answer",
    { description: "Answers at length", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ({ content: [{ type: "text", text: "x".repeat(40_000) }] })
  )
  return server
}

export type HttpMcpFixture = {
  /** The server's MCP endpoint, e.g. http://localhost:1234/mcp. */
  url: string
  /** How many connections initialized (one per client that connected). */
  initializations: () => number
  stop: () => void
}

/** Starts the fixture; with `apiKey`, requests without `Authorization: Bearer <apiKey>` get a 401. */
export function startHttpMcpFixture(opts: { apiKey?: string } = {}): HttpMcpFixture {
  let initializations = 0
  const httpServer = Bun.serve({
    port: 0,
    async fetch(req) {
      if (opts.apiKey && req.headers.get("authorization") !== `Bearer ${opts.apiKey}`) {
        return new Response("unauthorized", { status: 401 })
      }
      if (req.method === "POST") {
        const body = await req.clone().text()
        if (body.includes('"method":"initialize"')) initializations++
      }
      // Stateless: a fresh server and transport per request, as the SDK recommends without sessions.
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      })
      await fixtureServer().connect(transport)
      return transport.handleRequest(req)
    }
  })
  return {
    url: `http://localhost:${httpServer.port}/mcp`,
    initializations: () => initializations,
    stop: () => httpServer.stop(true)
  }
}

/** A fetch that sends requests for `host` to the fixture instead, the way a proxy would. */
export function routeHostTo(fixture: HttpMcpFixture, host: string, realFetch: typeof fetch = fetch) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.host !== host) return realFetch(input, init)
    const target = new URL(fixture.url)
    url.protocol = target.protocol
    url.host = target.host
    const { proxy: _proxy, ...rest } = (init ?? {}) as RequestInit & { proxy?: string }
    return realFetch(url, rest)
  }) as typeof fetch
}
