import { trimTrailingSlashes } from "@kaja/shared"

/** What a model is assumed to hold when neither config nor its server says. */
export const DEFAULT_CONTEXT_WINDOW = 32_768

/** Where a resolved context window came from, for `kaja doctor`. */
export type ContextWindowSource = "config" | "detected" | "fallback"

export type ContextWindowTarget = {
  /** The OpenAI-compatible base URL, e.g. "http://localhost:11434/v1". */
  baseUrl: string
  apiKey?: string
  /** The provider-facing model name. */
  model: string
  /** models.toml `context_window` (or the cloud model row's); wins over detection. */
  contextWindow?: number
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const PROBE_TIMEOUT_MS = 3000

// One detection per server and model for the life of the process: a window doesn't change while it runs.
const cache = new Map<string, Promise<{ tokens: number; source: ContextWindowSource }>>()

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined
}

async function getJson(fetchFn: Fetch, url: string, init: RequestInit = {}): Promise<any> {
  try {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return res.ok ? await res.json() : undefined
  } catch {
    return undefined
  }
}

// The server root: Ollama's and llama.cpp's own endpoints sit beside the OpenAI-compatible /v1.
function rootOf(baseUrl: string): string {
  const trimmed = trimTrailingSlashes(baseUrl)
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed
}

// llama.cpp: /props reports n_ctx, the size the server actually runs with (per slot).
async function fromLlamaCpp(fetchFn: Fetch, target: ContextWindowTarget) {
  const props = await getJson(fetchFn, `${rootOf(target.baseUrl)}/props`)
  return positive(props?.default_generation_settings?.n_ctx) ?? positive(props?.n_ctx)
}

// Ollama: a loaded model's running size (/api/ps), else a num_ctx the model sets, else what the model supports.
async function fromOllama(fetchFn: Fetch, target: ContextWindowTarget) {
  const root = rootOf(target.baseUrl)
  const ps = await getJson(fetchFn, `${root}/api/ps`)
  const loaded = (ps?.models as any[] | undefined)?.find(m => m?.name === target.model || m?.model === target.model)
  const running = positive(loaded?.context_length)
  if (running) return running

  const show = await getJson(fetchFn, `${root}/api/show`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: target.model })
  })
  const parameters: string = typeof show?.parameters === "string" ? show.parameters : ""
  const numCtx = parameters
    .split("\n")
    .map(line => /^num_ctx\s+(\d+)$/.exec(line.trim()))
    .find(Boolean)
  if (numCtx) return positive(Number(numCtx[1]))
  const info = show?.model_info as Record<string, unknown> | undefined
  const key = info && Object.keys(info).find(k => k.endsWith(".context_length"))
  return key ? positive(info[key]) : undefined
}

// OpenAI-compatible /models: several hosts and vLLM add the window to each entry under one of these names.
async function fromModelsList(fetchFn: Fetch, target: ContextWindowTarget) {
  const list = await getJson(fetchFn, `${trimTrailingSlashes(target.baseUrl)}/models`, {
    headers: target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {}
  })
  const entry = (list?.data as any[] | undefined)?.find(m => m?.id === target.model)
  return (
    positive(entry?.context_length) ??
    positive(entry?.context_window) ??
    positive(entry?.max_model_len) ??
    positive(entry?.max_context_length)
  )
}

// Fireworks: its OpenAI-compatible /models list fails for serverless models, but its own API has each one's contextLength.
async function fromFireworks(fetchFn: Fetch, target: ContextWindowTarget) {
  if (!/^accounts\/[^/]+\/models\/[^/]+$/.test(target.model)) return undefined
  const model = await getJson(fetchFn, `${new URL(target.baseUrl).origin}/v1/${target.model}`, {
    headers: target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {}
  })
  return positive(model?.contextLength)
}

// Every probe at once, so a hosted model doesn't wait on the local-server ones failing; the first in this order that answers wins.
async function detect(fetchFn: Fetch, target: ContextWindowTarget) {
  const answers = await Promise.all(
    [fromLlamaCpp, fromOllama, fromModelsList, fromFireworks].map(probe => probe(fetchFn, target))
  )
  const tokens = answers.find(Boolean)
  return tokens
    ? { tokens, source: "detected" as const }
    : { tokens: DEFAULT_CONTEXT_WINDOW, source: "fallback" as const }
}

/**
 * A model's context window in tokens: its configured `contextWindow`, else what its server reports
 * (llama.cpp, Ollama, an OpenAI-compatible /models entry, or Fireworks' model API), else {@link DEFAULT_CONTEXT_WINDOW}.
 * Detection runs once per server and model; failed probes are silent.
 */
export function resolveContextWindow(
  target: ContextWindowTarget,
  fetchFn: Fetch = fetch
): Promise<{ tokens: number; source: ContextWindowSource }> {
  const configured = positive(target.contextWindow)
  if (configured) return Promise.resolve({ tokens: configured, source: "config" })
  const key = `${target.baseUrl}\n${target.model}`
  let pending = cache.get(key)
  if (!pending) {
    pending = detect(fetchFn, target)
    cache.set(key, pending)
  }
  return pending
}

/** Records that a model's server rejected a prompt of about `tokens` as too long, so later lookups use less. */
export function lowerContextWindow(target: ContextWindowTarget, tokens: number) {
  cache.set(`${target.baseUrl}\n${target.model}`, Promise.resolve({ tokens, source: "detected" }))
}

/** Test seam: forgets every detected window. */
export function clearContextWindowCache() {
  cache.clear()
}
