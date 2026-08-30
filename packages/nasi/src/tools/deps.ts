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
  rerank?: RerankModel
  imageGeneration?: ImageGenModel
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
