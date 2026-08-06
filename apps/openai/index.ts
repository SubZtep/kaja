import { error, info } from "@kaja/logger"
import { isPublicHttpUrl } from "@kaja/shared"

const KAJA_API_URL = process.env.KAJA_API_URL ?? "https://api.kaja.io"
/** Fail-closed: empty/missing token rejects every request. */
const CONFIG_API_TOKEN = process.env.CONFIG_API_TOKEN?.trim() || undefined
const PORT = 6669

/**
 * Response header carrying the model this proxy resolved and put in the
 * upstream request body. Clients (CLI) read this instead of scraping the
 * completion stream — same name, no body rewriting.
 */
export const KAJA_MODEL_HEADER = "x-kaja-model"

type ResolvedModel = {
  id: string
  model: string
  tasks: string[]
  baseUrl: string
  apiKey: string | null
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 })
}

export function isAuthorized(req: Request): boolean {
  if (!CONFIG_API_TOKEN) return false
  return req.headers.get("authorization") === `Bearer ${CONFIG_API_TOKEN}`
}

async function resolveRandomModel(): Promise<ResolvedModel> {
  if (!CONFIG_API_TOKEN) {
    throw new Error("CONFIG_API_TOKEN is not set")
  }
  const res = await fetch(`${KAJA_API_URL}/config/models`, {
    headers: { authorization: `Bearer ${CONFIG_API_TOKEN}` }
  })
  if (!res.ok) {
    throw new Error(`Failed to resolve a random model: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

/** Attach the resolved request model on the way back out (body untouched). */
export function withModelHeader(headers: Headers, model: string): Headers {
  const next = new Headers(headers)
  next.set(KAJA_MODEL_HEADER, model)
  return next
}

export default {
  port: PORT,
  idleTimeout: 30,
  async fetch(req: Request) {
    if (!isAuthorized(req)) {
      return unauthorized()
    }

    let resolved: ResolvedModel
    try {
      resolved = await resolveRandomModel()
    } catch (err) {
      error("Failed to resolve model", { error: err })
      return new Response("Bad Gateway", { status: 502 })
    }

    const { baseUrl, apiKey, model } = resolved
    if (!isPublicHttpUrl(baseUrl)) {
      error("Rejected unsafe model baseUrl", { baseUrl, model })
      return new Response("Bad Gateway", { status: 502 })
    }

    info("Forwarding request to model", { model, baseUrl })

    const url = new URL(req.url)
    const target = baseUrl.replace(/\/$/, "") + url.pathname + url.search

    let body: RequestInit["body"] = undefined
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        const reqBody = await req.json()
        // Same `model` the free-chat CLI asked us to pick — we already know it.
        body = JSON.stringify({ ...reqBody, model })
      } catch {
        return new Response("Bad Request", { status: 400 })
      }
    }

    let upstream: Response
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers: {
          "content-type": req.headers.get("content-type") || "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
        },
        body,
        // @ts-expect-error bun supports duplex for streaming request bodies
        duplex: "half"
      })
    } catch (err) {
      error("Upstream model request failed", { error: err, target, model })
      return new Response("Bad Gateway", { status: 502 })
    }

    // Stream the body through unchanged; tell the client which model we used.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: withModelHeader(upstream.headers, model)
    })
  }
}
