import { trimTrailingSlashes } from "@kaja/shared/text"
import { KAJA_USER_AGENT } from "../auth/user-agent"

/** What `GET {baseUrl}/models` said: the ids it lists, or why there are none (`status` when the server answered). */
export type ModelsProbe = { ok: true; ids: string[] } | { ok: false; status?: number; error: string }

/**
 * Asks an OpenAI-compatible server (Ollama, llama.cpp, vLLM and the hosted APIs all answer it) for its model ids,
 * sorted. With a key, a 401/403 is the server refusing that key: the wizard's live key check reads it so.
 */
export async function probeModels(
  baseUrl: string,
  apiKey?: string,
  { timeoutMs = 3000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ModelsProbe> {
  try {
    const res = await fetch(`${trimTrailingSlashes(baseUrl)}/models`, {
      headers: { "User-Agent": KAJA_USER_AGENT, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    const body = (await res.json()) as { data?: unknown }
    if (!Array.isArray(body.data))
      return { ok: false, status: res.status, error: "not an OpenAI-compatible model list" }
    const ids = body.data.flatMap(entry => {
      const id = (entry as { id?: unknown } | null)?.id
      return typeof id === "string" && id ? [id] : []
    })
    return { ok: true, ids: [...new Set(ids)].sort((a, b) => a.localeCompare(b)) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: apiKey ? message.replaceAll(apiKey, "•••") : message }
  }
}

/** The model ids a server lists, empty when it can't be reached or answers anything else: the wizard then asks for one. */
export async function listModelIds(baseUrl: string, apiKey?: string, timeoutMs = 3000): Promise<string[]> {
  const probe = await probeModels(baseUrl, apiKey, { timeoutMs })
  return probe.ok ? probe.ids : []
}
