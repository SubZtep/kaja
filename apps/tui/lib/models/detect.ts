import type { ModelTask } from "@kaja/schema/config"
import type { CatalogProvider } from "./catalog"
import { probeModels } from "./list"

/** Whether two addresses name the same server: `localhost` and `127.0.0.1` alike, a trailing slash ignored. */
export function sameAddress(a: string, b: string): boolean {
  const normal = (url: string) => url.replace("://localhost", "://127.0.0.1").replace(/\/+$/, "")
  return normal(a) === normal(b)
}

/** A model server answering on this machine (or where an environment variable points), and the models it lists. */
export type DetectedServer = { id: string; name: string; baseUrl: string; models: string[] }

type Candidate = { id: string; name: string; baseUrl: string }

// The usual ports of the local servers people run, each speaking the OpenAI API under /v1
const KNOWN: Candidate[] = [
  { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" },
  { id: "lmstudio", name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1" },
  { id: "llama", name: "llama.cpp", baseUrl: "http://127.0.0.1:8080/v1" },
  { id: "vllm", name: "vLLM", baseUrl: "http://127.0.0.1:8000/v1" },
  { id: "jan", name: "Jan", baseUrl: "http://127.0.0.1:1337/v1" },
  { id: "koboldcpp", name: "KoboldCpp", baseUrl: "http://127.0.0.1:5001/v1" },
  { id: "textgen", name: "text-generation-webui", baseUrl: "http://127.0.0.1:5000/v1" }
]

/** `host:port`, `0.0.0.0:port` or a full URL, as OLLAMA_HOST and friends hold it, to a reachable `/v1` address. */
function envAddress(value: string | undefined, defaultPort: number): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(/^https?:\/\//.test(value) ? value : `http://${value}`)
    if (url.hostname === "0.0.0.0" || url.hostname === "") url.hostname = "127.0.0.1"
    if (!url.port) url.port = String(defaultPort)
    const path = url.pathname.replace(/\/+$/, "")
    return `${url.origin}${path.endsWith("/v1") ? path : `${path}/v1`}`
  } catch {
    return undefined
  }
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|[^.]+\.local$|[^.]+$)/

/** Where the environment says a server listens: OLLAMA_HOST, llama.cpp's LLAMA_ARG_HOST/PORT, a local OPENAI_BASE_URL. */
export function envCandidates(env: Record<string, string | undefined>): Candidate[] {
  const found: Candidate[] = []
  const ollama = envAddress(env.OLLAMA_HOST, 11434)
  if (ollama) found.push({ id: "ollama", name: "Ollama", baseUrl: ollama })
  const llamaHost = env.LLAMA_ARG_HOST ?? (env.LLAMA_ARG_PORT ? "127.0.0.1" : undefined)
  const llama = envAddress(llamaHost && `${llamaHost}${env.LLAMA_ARG_PORT ? `:${env.LLAMA_ARG_PORT}` : ""}`, 8080)
  if (llama) found.push({ id: "llama", name: "llama.cpp", baseUrl: llama })
  // Only a server on this machine or the LAN: a hosted API there is a provider, not a detected server
  for (const name of ["OPENAI_BASE_URL", "OPENAI_API_BASE"]) {
    const value = env[name]
    if (!value) continue
    try {
      if (PRIVATE_HOST.test(new URL(value).hostname))
        found.push({ id: "local", name: "OpenAI-compatible", baseUrl: value.replace(/\/+$/, "") })
    } catch {
      // not an address
    }
  }
  return found
}

// A model's likely tasks from its id: local servers say nothing else about what a model does
function tasksFromId(id: string): ModelTask[] {
  const name = id.toLowerCase()
  // Before embedding: rerankers are often named after the embedder they pair with (bge-reranker)
  if (name.includes("rerank")) return ["rerank"]
  if (/embed|bge-|e5-|minilm/.test(name)) return ["embedding"]
  if (/whisper|parakeet|transcri/.test(name)) return ["stt"]
  if (/kokoro|piper|tts|xtts|speech/.test(name)) return ["tts"]
  return ["chat", "summarize"]
}

// What answers on Ollama's own API, beside the OpenAI one: it confirms the server is Ollama whatever its port
async function isOllama(baseUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/v1$/, "")}/api/version`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok && typeof ((await res.json()) as { version?: unknown }).version === "string"
  } catch {
    return false
  }
}

/**
 * The model servers running here, found by asking each usual port (and any address the environment names) for its
 * models, all at once. A server listing nothing is left out: there would be nothing to pick. Never throws.
 */
export async function detectLocalServers({
  env = process.env,
  candidates = [...envCandidates(env), ...KNOWN],
  timeoutMs = 800
}: { env?: Record<string, string | undefined>; candidates?: Candidate[]; timeoutMs?: number } = {}): Promise<
  DetectedServer[]
> {
  const unique = candidates.filter((c, index) => candidates.findIndex(other => other.baseUrl === c.baseUrl) === index)
  const results = await Promise.all(
    unique.map(async candidate => {
      const probe = await probeModels(candidate.baseUrl, undefined, { timeoutMs })
      if (!probe.ok || probe.ids.length === 0) return undefined
      // Speaches serves only voice models, on vLLM's usual port; its address is the origin, as settings.toml wants it
      const voiceOnly = probe.ids.every(id => ["stt", "tts"].includes(tasksFromId(id)[0]!))
      if (voiceOnly) {
        return { id: "speaches", name: "Speaches", baseUrl: candidate.baseUrl.replace(/\/v1$/, ""), models: probe.ids }
      }
      if (candidate.id !== "ollama" && (await isOllama(candidate.baseUrl, timeoutMs)))
        return { ...candidate, id: "ollama", name: "Ollama", models: probe.ids }
      return { ...candidate, models: probe.ids }
    })
  )
  return results.filter(server => server !== undefined)
}

/** A detected server as a provider the wizard offers: self-hosted, with each model's tasks guessed from its id. */
export function detectedProvider(server: DetectedServer): CatalogProvider {
  return {
    id: server.id,
    name: server.name,
    kind: "self-hosted",
    baseUrl: server.baseUrl,
    models: server.models.map(model => ({ model, tasks: tasksFromId(model) }))
  }
}
