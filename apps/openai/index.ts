const KAJA_API_URL = process.env.KAJA_API_URL
const MODEL_ID = process.env.MODEL_ID
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "kaja"
const PORT = process.env.PORT ?? 6669

if (!KAJA_API_URL) {
  console.error("Missing KAJA_API_URL environment variable")
  process.exit(1)
}

if (!MODEL_ID) {
  console.error("Missing MODEL_ID environment variable")
  process.exit(1)
}

type ResolvedModel = {
  id: string
  model: string
  tasks: string[]
  baseUrl: string
  apiKey: string | null
}

async function resolveModel(): Promise<ResolvedModel> {
  const res = await fetch(`${KAJA_API_URL}/config/models/${MODEL_ID}`)
  if (!res.ok) {
    throw new Error(`Failed to resolve model ${MODEL_ID}: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

const { baseUrl, apiKey } = await resolveModel()

Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.headers.get("authorization") !== `Bearer ${AUTH_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const url = new URL(req.url)
    const target = baseUrl + url.pathname + url.search

    // forward request as-is (method, headers, body), stream response straight through
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") || "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
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

console.log(`Proxy listening on :${PORT} -> ${baseUrl}`)
