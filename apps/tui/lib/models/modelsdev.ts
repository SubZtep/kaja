import { join } from "node:path"
import type { ModelTask } from "@kaja/schema/config"
import { trimTrailingSlashes } from "@kaja/shared/text"
import { file, write } from "bun"
import { z } from "zod"
import { KAJA_USER_AGENT } from "../auth/user-agent"
import { log } from "../logger"
import { getPaths } from "../paths"
import { type CatalogModel, type CatalogProvider, setCatalog } from "./catalog"

/** Models.dev's registry of providers and models: what the wizard offers online. About 600 KB gzipped. */
const MODELS_DEV_URL = "https://models.dev/api.json"

/**
 * The OpenAI-compatible endpoints of well-known providers models.dev lists without an `api` (their own SDK package
 * carries it). Used only when models.dev has none.
 */
const KNOWN_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  togetherai: "https://api.together.xyz/v1",
  cerebras: "https://api.cerebras.ai/v1",
  perplexity: "https://api.perplexity.ai"
}

// The part of models.dev's shape the wizard reads; anything else is ignored.
const modelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.string().optional(),
  tool_call: z.boolean().optional(),
  release_date: z.string().optional(),
  status: z.string().optional(),
  modalities: z.object({ input: z.array(z.string()).optional(), output: z.array(z.string()).optional() }).optional(),
  limit: z.object({ context: z.number().optional() }).optional()
})

const providerSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1),
  api: z.string().optional(),
  env: z.array(z.string()).default([]),
  models: z.record(z.string(), z.unknown())
})

/** The tasks a models.dev model can do, from its `type` and modalities; none for one Kaja can't use. */
function tasksFor(model: z.infer<typeof modelSchema>): ModelTask[] {
  const input = model.modalities?.input ?? ["text"]
  const output = model.modalities?.output ?? ["text"]
  switch (model.type) {
    case "embedding":
      return ["embedding"]
    case "transcription":
      return ["stt"]
    case "speech":
      return ["tts"]
    case "image":
      return ["image-generation"]
    case "reranking":
      return ["rerank"]
    case undefined:
    case "chat":
      if (!output.includes("text")) return []
      return input.includes("image") ? ["chat", "summarize", "vision"] : ["chat", "summarize"]
    default:
      return []
  }
}

function toModel(raw: unknown): CatalogModel | undefined {
  const parsed = modelSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const model = parsed.data
  const tasks = tasksFor(model)
  if (tasks.length === 0) return undefined
  const context = model.limit?.context
  return {
    model: model.id,
    ...(model.name ? { name: model.name } : {}),
    tasks,
    ...(context && Number.isInteger(context) && context > 0 ? { contextWindow: context } : {}),
    // Only a chat model is ever sent images
    ...(tasks.includes("chat") && !tasks.includes("vision") ? { images: false } : {}),
    ...(model.tool_call ? { toolCall: true } : {}),
    ...(model.release_date ? { released: model.release_date } : {}),
    ...(model.status === "deprecated" ? { deprecated: true } : {})
  }
}

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/

function toProvider(raw: unknown): CatalogProvider | undefined {
  const parsed = providerSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const provider = parsed.data
  const api = provider.api ?? KNOWN_BASE_URLS[provider.id]
  const baseUrl = api && trimTrailingSlashes(api)
  if (!baseUrl) return undefined
  const kind = LOCAL_HOST.test(baseUrl) ? "self-hosted" : "hosted"
  // A key is never sent over plain http to someone else's server
  if (kind === "hosted" && !baseUrl.startsWith("https://")) return undefined
  const models = Object.values(provider.models).flatMap(model => toModel(model) ?? [])
  if (models.length === 0) return undefined
  return { id: provider.id, name: provider.name, kind, baseUrl, env: provider.env, models }
}

/** Models.dev's `api.json` as the wizard's providers, by name: the ones with an address and a model Kaja can use. */
export function providersFromModelsDev(data: unknown): CatalogProvider[] {
  if (!data || typeof data !== "object") throw new Error("models.dev answered something that isn't an object")
  const providers = Object.values(data).flatMap(raw => toProvider(raw) ?? [])
  if (providers.length === 0) throw new Error("models.dev listed no usable provider")
  return providers.sort((a, b) => a.name.localeCompare(b.name))
}

const cachePaths = () => ({
  body: join(getPaths().cache, "models-dev.json"),
  etag: join(getPaths().cache, "models-dev.etag")
})

async function readCache(): Promise<{ text: string; etag?: string } | undefined> {
  const paths = cachePaths()
  try {
    const body = file(paths.body)
    if (!(await body.exists())) return undefined
    const etag = file(paths.etag)
    return { text: await body.text(), etag: (await etag.exists()) ? (await etag.text()).trim() : undefined }
  } catch (error) {
    log.warn("Ignoring the cached models.dev catalog", { error })
    return undefined
  }
}

/**
 * Loads models.dev's providers into the wizard's catalog. The last good copy is kept in the cache dir, so an unchanged
 * registry is a 304 and an unreachable one still offers it. True when a catalog is in use; false (none at all) leaves
 * the wizard asking for every detail itself.
 */
export async function refreshCatalog({ url = MODELS_DEV_URL, timeoutMs = 8000 } = {}): Promise<boolean> {
  const cached = await readCache()
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": KAJA_USER_AGENT, ...(cached?.etag ? { "If-None-Match": cached.etag } : {}) },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (res.status === 304 && cached) {
      setCatalog(providersFromModelsDev(JSON.parse(cached.text)))
      return true
    }
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)

    const text = await res.text()
    setCatalog(providersFromModelsDev(JSON.parse(text)))
    const paths = cachePaths()
    const etag = res.headers.get("etag")
    await Promise.all([write(paths.body, text), etag ? write(paths.etag, etag) : file(paths.etag).delete()]).catch(
      (error: unknown) => log.warn("Couldn't cache the models.dev catalog", { error })
    )
    return true
  } catch (error) {
    try {
      if (cached) {
        setCatalog(providersFromModelsDev(JSON.parse(cached.text)))
        log.warn("Using the cached models.dev catalog", { error })
        return true
      }
    } catch (cacheError) {
      log.warn("The cached models.dev catalog is unusable", { error: cacheError })
    }
    log.warn("No models.dev catalog", { error })
    setCatalog()
    return false
  }
}
