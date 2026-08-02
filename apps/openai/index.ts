import { info } from "@kaja/logger"

const KAJA_API_URL = process.env.KAJA_API_URL ?? "https://api.kaja.io"
const CONFIG_API_TOKEN = process.env.CONFIG_API_TOKEN
const PORT = 6669

type ResolvedModel = {
  id: string
  model: string
  tasks: string[]
  baseUrl: string
  apiKey: string | null
}

async function resolveRandomModel(): Promise<ResolvedModel> {
  const res = await fetch(`${KAJA_API_URL}/config/models`, {
    headers: { authorization: `Bearer ${CONFIG_API_TOKEN}` }
  })
  if (!res.ok) {
    throw new Error(`Failed to resolve a random model: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export default {
  port: PORT,
  idleTimeout: 30,
  async fetch(req: Request) {
    if (req.headers.get("authorization") !== `Bearer ${CONFIG_API_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { baseUrl, apiKey, model } = await resolveRandomModel()
    info("Forwarding request to model", { model, baseUrl })

    const url = new URL(req.url)
    const target = baseUrl + url.pathname + url.search

    let body: RequestInit["body"] = undefined
    if (req.method !== "GET" && req.method !== "HEAD") {
      const reqBody = await req.json()
      body = JSON.stringify({ ...reqBody, model })
    }

    // forward request as-is (method, headers, body), stream response straight through
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") || "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body,
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
}
