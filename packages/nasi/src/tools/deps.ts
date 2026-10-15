import type OpenAI from "openai"
import type { FetchLike } from "../security/ssrf"

export type ImageGenModel = {
  model: string
  baseUrl: string
  apiKey?: string | null
}

export type RerankModel = {
  model: string
  baseUrl: string
  apiKey?: string | null
}

export type NasiToolDeps = {
  chat?: { client: OpenAI; model: string }
  /** The summarize task's model, for the `summarize` tool; falls back to {@link chat}. */
  summarizer?: { client: OpenAI; model: string; contextWindow?: number }
  /** Resolves the rerank model to use, given the active persona's id (if any) — lets the caller honor a persona's per-task model pin without this package knowing about personas/models.toml. */
  rerank?: (personaId?: string) => RerankModel | undefined
  /** Resolves the image-generation model to use, given the active persona's id (if any) — see {@link rerank}. */
  imageGeneration?: (personaId?: string) => ImageGenModel | undefined
  /** Sends `fetch_url`'s requests (the cloud: through a sandbox). Unset connects from this machine, which only local mode does: a cloud registry leaves `fetch_url` out without it. */
  fetchSend?: FetchLike
  tempDir?: string
  workspaceRoot?: string
  /** Absolute path of the local sqlite file, denied by the path guard. */
  storePath?: string
}

let deps: NasiToolDeps = {}

export function setToolDeps(next: NasiToolDeps) {
  deps = next
}

export function getToolDeps(): NasiToolDeps {
  return deps
}
