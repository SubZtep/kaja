import OpenAI from "openai"
import { config } from "../config/config"
import { services } from "../config/services"
import { loadModelsFile, resolveModelById } from "./models"

// Free hosted chat tier: used when config.json's models.chat is omitted,
// resolved here directly instead of via models.toml, since it has no
// per-user provider config to look up — just a shared public endpoint. The
// proxy picks the actual model server-side, so this id is just a
// placeholder in the request body.
const FREE_CHAT_BASE_URL = "https://openai.kaja.io"
const FREE_CHAT_API_KEY = "kaja"
const FREE_CHAT_MODEL_ID = "auto"

/** Free-chat proxy sets this to the model it resolved and put in the request. */
export const KAJA_MODEL_HEADER = "x-kaja-model"

/** Forwarded to the free-chat proxy: use this key instead of its DB-sourced provider key. */
const KAJA_ZEN_KEY_HEADER = "x-kaja-zen-key"

const { models } = await config()
const { zen } = await services()
/** True when config.json's models.chat is omitted, i.e. the free hosted (OpenCode Zen) tier is in use. */
export const isFreeChat = !models.chat
const chatModel = isFreeChat
  ? { id: FREE_CHAT_MODEL_ID, task: "chat" as const, baseUrl: FREE_CHAT_BASE_URL, apiKey: FREE_CHAT_API_KEY }
  : resolveModelById(await loadModelsFile(), models.chat!)
if (!chatModel) {
  throw new Error(`No model in models.toml matches config.json's models.chat ("${models.chat}")`)
}

/** The resolved chat model name, as sent to the provider's API. */
export const chatModelId = chatModel.id

/**
 * Last model id reported by a free-chat proxy via {@link KAJA_MODEL_HEADER}.
 * Filled as soon as response headers arrive (before the stream body).
 */
let lastServedModel: string | undefined

/** Record a served model id (free-chat proxy header, or tests). */
export function noteServedModel(model: string) {
  lastServedModel = model
}

/** Take (and clear) the model id from the most recent free-chat response, if any. */
export function takeLastServedModel(): string | undefined {
  const model = lastServedModel
  lastServedModel = undefined
  return model
}

/**
 * OpenAI client that records `x-kaja-model` from free-chat proxy responses.
 * Used for the default chat client and for mid-session model switches.
 */
export function createOpenAIClient(opts: {
  baseURL: string
  apiKey: string
  headers?: Record<string, string>
}): OpenAI {
  return new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      for (const [key, value] of Object.entries(opts.headers ?? {})) headers.set(key, value)
      const res = await fetch(input, { ...init, headers })
      const served = res.headers.get(KAJA_MODEL_HEADER)
      if (served) noteServedModel(served)
      return res
    }
  })
}

export const client = createOpenAIClient({
  apiKey: chatModel.apiKey ?? "unused",
  baseURL: chatModel.baseUrl,
  headers: isFreeChat && zen?.apiKey ? { [KAJA_ZEN_KEY_HEADER]: zen.apiKey } : undefined
})
