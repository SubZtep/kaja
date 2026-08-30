import type OpenAI from "openai"
import type { GeoLocation } from "../agent/geo"

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
  /** Resolves the rerank model to use, given the active persona's id (if any) — lets the caller honor a persona's per-task model pin without this package knowing about personas/models.toml. */
  rerank?: (personaId?: string) => RerankModel | undefined
  /** Resolves the image-generation model to use, given the active persona's id (if any) — see {@link rerank}. */
  imageGeneration?: (personaId?: string) => ImageGenModel | undefined
  webSearchApiKey?: string
  lookupLocation?: () => Promise<GeoLocation | undefined>
  tempDir?: string
  workspaceRoot?: string
}

let deps: NasiToolDeps = {}

export function setToolDeps(next: NasiToolDeps) {
  deps = next
}

export function getToolDeps(): NasiToolDeps {
  return deps
}
