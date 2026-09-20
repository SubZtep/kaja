import type { CliResolvedModel } from "@kaja/schema/config"

/** A model the config points at that its server could fetch on request. */
export type PullTarget = { model: string; baseUrl: string }

/** One status update while a model downloads; `percent` only once the server reports a size. */
export type PullProgress = { status: string; percent?: number }

const LIST_TIMEOUT_MS = 3_000

/** Ollama's own API sits beside the OpenAI-compatible one models.toml points at, so `.../v1` has to come off first. */
export function ollamaOrigin(baseUrl: string): string {
  return baseUrl.replace(/\/+v1\/*$/, "")
}

/** `ollama pull llama3.2` installs "llama3.2:latest", which is how /api/tags names it back. */
export function withTag(model: string): string {
  return model.includes(":") ? model : `${model}:latest`
}

/**
 * What this server already has, or undefined when nothing Ollama-shaped answers — a cloud provider,
 * llama.cpp (which serves the model it was started with and can't fetch another), or a server that
 * isn't running. Undefined means "don't offer downloads", never "nothing is installed".
 */
async function installedModels(baseUrl: string): Promise<Set<string> | undefined> {
  try {
    const res = await fetch(`${ollamaOrigin(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
    if (!res.ok) return undefined
    const body = (await res.json()) as { models?: unknown }
    if (!Array.isArray(body.models)) return undefined
    return new Set(body.models.map(entry => entry?.name).filter((name): name is string => typeof name === "string"))
  } catch {
    return undefined
  }
}

/**
 * The configured models their server hasn't got yet, deduplicated — what the setup wizard offers to
 * download in one go. Servers that can't fetch a model are skipped, so an empty list also covers
 * "there is nothing sensible to offer here".
 */
export async function missingModels(models: CliResolvedModel[]): Promise<PullTarget[]> {
  const byUrl = new Map<string, CliResolvedModel[]>()
  for (const model of models) {
    if (!model.baseUrl) continue
    byUrl.set(model.baseUrl, [...(byUrl.get(model.baseUrl) ?? []), model])
  }

  const targets: PullTarget[] = []
  for (const [baseUrl, group] of byUrl) {
    const installed = await installedModels(baseUrl)
    if (!installed) continue
    for (const { model } of group) {
      if (installed.has(withTag(model))) continue
      // Two tasks can name the same model, and the wizard must not download it twice.
      if (targets.some(target => target.baseUrl === baseUrl && target.model === model)) continue
      targets.push({ model, baseUrl })
    }
  }
  return targets
}

function parseEvent(line: string): Record<string, unknown> | undefined {
  if (!line.trim()) return undefined
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
}

// /api/pull answers with newline-delimited JSON, one object per progress update.
async function* streamEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    // The last piece may be half an object; it stays in the buffer until its newline arrives.
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const event = parseEvent(line)
      if (event) yield event
    }
  }
  const last = parseEvent(buffer)
  if (last) yield last
}

/** The error text an Ollama response body carries, if it carries one. */
async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined
  return typeof body?.error === "string" ? body.error : `HTTP ${res.status}`
}

/**
 * Downloads one model, reporting progress as the server sends it. Never throws: a server that goes
 * away mid-download is just another failed model, and the wizard carries on to the next one.
 */
export async function pullModel(
  target: PullTarget,
  onProgress: (progress: PullProgress) => void = () => {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${ollamaOrigin(target.baseUrl)}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: target.model, stream: true })
    })
    if (!res.ok) return { ok: false, error: await errorText(res) }
    if (!res.body) return { ok: false, error: `HTTP ${res.status}` }

    // A pull that fails partway still answers 200 and reports the reason in the stream.
    let failure: string | undefined
    for await (const event of streamEvents(res.body)) {
      if (typeof event.error === "string") failure = event.error
      if (typeof event.status !== "string") continue
      const total = typeof event.total === "number" ? event.total : undefined
      const completed = typeof event.completed === "number" ? event.completed : 0
      onProgress({ status: event.status, percent: total ? Math.round((completed / total) * 100) : undefined })
    }
    return failure ? { ok: false, error: failure } : { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
