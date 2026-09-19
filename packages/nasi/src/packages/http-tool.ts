import type { HttpTool, HttpToolPackage } from "@kaja/schema/packages"
import { type Tool, tool } from "../agent/tools"
import { fetchPublicHttp } from "../security/ssrf"

const TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
/** What the model gets of a body; the rest is cut with a note. JSON is passed through compact: pretty-printing big arrays would triple it. */
const MAX_RESULT_CHARS = 32 * 1024
const MAX_BODY_PREVIEW = 200
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"])
const TEXT_CONTENT = /json|text|xml|javascript|x-www-form-urlencoded/i
const PLACEHOLDER = /\{([^}]+)\}/g
/** Stands in for the key wherever a request is shown instead of sent. */
const KEY_MASK = "•••"

export type HttpRequestSpec = { url: string; method: string; headers: Record<string, string>; body?: string }

function queryValue(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

/**
 * Turns a tool call into a request: `{name}` placeholders in the path are filled
 * (URL-encoded, so they can't change the host or add path segments), the other
 * arguments go to the query string (GET/DELETE) or a JSON body (POST/PUT/PATCH),
 * and the key goes where the package's `auth` says. Throws on a missing path value.
 */
export function buildHttpRequest(
  pkg: HttpToolPackage,
  def: Pick<HttpTool, "method" | "path">,
  args: Record<string, unknown>,
  apiKey?: string
): HttpRequestSpec {
  const used = new Set<string>()
  const filled = def.path.replace(PLACEHOLDER, (_, name: string) => {
    used.add(name)
    const value = args[name]
    if (value === undefined || value === null || value === "") throw new Error(`missing value for {${name}}`)
    return encodeURIComponent(String(value))
  })
  const [path = "", staticQuery] = filled.split("?", 2)

  const url = new URL(pkg.baseUrl)
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${path}`
  for (const [key, value] of new URLSearchParams(staticQuery ?? "")) url.searchParams.append(key, value)

  const headers: Record<string, string> = { ...pkg.headers }
  const rest = Object.entries(args).filter(([key, value]) => !used.has(key) && value !== undefined && value !== null)
  let body: string | undefined
  if (BODY_METHODS.has(def.method)) {
    if (rest.length > 0) {
      body = JSON.stringify(Object.fromEntries(rest))
      headers["Content-Type"] ??= "application/json"
    }
  } else {
    for (const [key, value] of rest) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, queryValue(item))
    }
  }

  if (pkg.auth.type === "apiKey" && (apiKey || !pkg.auth.optional)) {
    if (!apiKey) throw new Error(`no API key for ${pkg.name}`)
    const value = `${pkg.auth.prefix ?? ""}${apiKey}`
    if (pkg.auth.in === "header") headers[pkg.auth.name] = value
    else url.searchParams.set(pkg.auth.name, value)
  }

  return { url: url.toString(), method: def.method, headers, body }
}

/** The status line plus the body as text, cut at {@link MAX_RESULT_CHARS}; binary bodies are described, not shown. */
async function formatResponse(res: Response): Promise<string> {
  const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`
  const contentType = res.headers.get("content-type") ?? ""
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength === 0) return status
  if (contentType && !TEXT_CONTENT.test(contentType)) {
    return `${status}\n\n(${contentType}, ${bytes.byteLength} bytes, not shown)`
  }
  const text = new TextDecoder().decode(bytes)
  if (text.length <= MAX_RESULT_CHARS) return `${status}\n\n${text}`
  return `${status}\n\n${text.slice(0, MAX_RESULT_CHARS)}\n\n[cut: ${text.length} characters in total]`
}

/** One line for the approval prompt, e.g. `POST https://api.example.com/v1/issues {"title":"…"}`, with the key masked (and left out when there's none, as for an optional key). */
export function approvalSummary(
  pkg: HttpToolPackage,
  def: HttpTool,
  args: Record<string, unknown>,
  hasKey = true
): string {
  let request: HttpRequestSpec
  try {
    request = buildHttpRequest(pkg, def, args, hasKey ? KEY_MASK : undefined)
  } catch {
    return `${def.method} ${pkg.baseUrl}${def.path}`
  }
  const body = request.body
    ? ` ${request.body.length > MAX_BODY_PREVIEW ? `${request.body.slice(0, MAX_BODY_PREVIEW)}…` : request.body}`
    : ""
  return `${request.method} ${request.url}${body}`
}

/**
 * One agent tool per manifest tool. Requests, responses and errors all come back as
 * text so the model can react instead of the turn failing; the key never appears in
 * any of them. Anything but GET asks for approval first (see `Tool.approval`).
 */
export function createHttpTools(
  pkg: HttpToolPackage,
  opts: { apiKey?: string; allowPrivate?: boolean; proxy?: string } = {}
): Tool<Record<string, unknown>>[] {
  const redact = (text: string) => (opts.apiKey ? text.replaceAll(opts.apiKey, KEY_MASK) : text)

  return pkg.tools.map(def => {
    const httpTool = tool<Record<string, unknown>>({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
      execute: async args => {
        let request: HttpRequestSpec
        try {
          request = buildHttpRequest(pkg, def, args ?? {}, opts.apiKey)
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`
        }
        try {
          const res = await fetchPublicHttp(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            allowPrivate: opts.allowPrivate,
            proxy: opts.proxy,
            sameOriginRedirects: true,
            timeoutMs: TIMEOUT_MS,
            maxBytes: MAX_RESPONSE_BYTES
          })
          return redact(await formatResponse(res))
        } catch (error) {
          return redact(`Request failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })
    if (def.method === "GET") return httpTool
    return {
      ...httpTool,
      approval: (args: Record<string, unknown>) => approvalSummary(pkg, def, args ?? {}, Boolean(opts.apiKey))
    }
  })
}

/** A key's live test: it works, or why not. */
export type KeyCheckResult = { ok: true } | { ok: false; reason: string }

/** Sends the manifest's `check` request with `apiKey` (2xx = it works); undefined when the manifest has no `check`. The key never appears in the reason. */
export async function checkHttpToolKey(
  pkg: HttpToolPackage,
  apiKey: string,
  opts: { allowPrivate?: boolean; proxy?: string } = {}
): Promise<KeyCheckResult | undefined> {
  if (!pkg.check) return undefined
  try {
    const request = buildHttpRequest(pkg, pkg.check, {}, apiKey)
    const res = await fetchPublicHttp(request.url, {
      method: request.method,
      headers: request.headers,
      allowPrivate: opts.allowPrivate,
      proxy: opts.proxy,
      sameOriginRedirects: true,
      timeoutMs: TIMEOUT_MS
    })
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message.replaceAll(apiKey, KEY_MASK) }
  }
}
