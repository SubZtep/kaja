import { KAJA_USER_AGENT } from "../auth/user-agent"

/**
 * The model ids an OpenAI-compatible server lists at `GET {baseUrl}/models` (Ollama, llama.cpp, vLLM and the hosted
 * APIs all answer it), sorted. Empty when it can't be reached or answers anything else: the wizard then asks for an id.
 */
export async function listModelIds(baseUrl: string, apiKey?: string, timeoutMs = 3000): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { "User-Agent": KAJA_USER_AGENT, ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return []
    const body = (await res.json()) as { data?: unknown }
    if (!Array.isArray(body.data)) return []
    const ids = body.data.flatMap(entry => {
      const id = (entry as { id?: unknown } | null)?.id
      return typeof id === "string" && id ? [id] : []
    })
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
