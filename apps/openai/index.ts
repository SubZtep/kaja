const OPENAI_URL = process.env.OPENAI_URL
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "kaja"
const PORT = process.env.PORT ?? 6669

if (!OPENAI_URL) {
  console.error("Missing OPENAI_URL environment variables")
  process.exit(1)
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.headers.get("authorization") !== `Bearer ${AUTH_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const url = new URL(req.url)
    const target = OPENAI_URL + url.pathname + url.search

    // forward request as-is (method, headers, body), stream response straight through
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") || "application/json"
      },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      // @ts-expect-error bun supports duplex for streaming request bodies
      duplex: "half"
    })

    // pass through upstream body/headers/status untouched — streaming works because
    // we never buffer, just hand back the same ReadableStream
    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers
    })
  }
})

console.log(`Proxy listening on :${PORT} -> ${OPENAI_URL}`)
