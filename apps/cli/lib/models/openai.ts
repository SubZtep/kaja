import type { CliResolvedModel } from "@kaja/schema/config"
import OpenAI from "openai"
import { config } from "../config/config"
import { services } from "../config/services"
import { loadModelsFile, resolveModelFromConfig } from "./models"

// Free hosted chat tier (no provider needed); "auto" model lets the proxy pick server-side.
const FREE_CHAT_BASE_URL = "https://openai.kaja.io"
const FREE_CHAT_API_KEY = "kaja"
const FREE_CHAT_MODEL_ID = "auto"
export const FREE_CHAT_PROVIDER = "kaja"

/** Free-chat proxy sets this to the model it resolved and put in the request. */
export const KAJA_MODEL_HEADER = "x-kaja-model"

/** Forwarded to the free-chat proxy: use this key instead of its DB-sourced provider key. */
const KAJA_ZEN_KEY_HEADER = "x-kaja-zen-key"

const { models } = await config()
const { zen } = await services()
/** True when settings.toml's models.chat has no provider, i.e. the free hosted (OpenCode Zen) tier is in use. */
export const isFreeChat = !models.chat?.provider
let chatModel: CliResolvedModel
if (models.chat?.provider) {
  try {
    chatModel = resolveModelFromConfig(await loadModelsFile(), models.chat, "chat")!
  } catch {
    throw new Error(
      `settings.toml's models.chat names provider "${models.chat.provider}", but models.toml has no [providers.${models.chat.provider}] table`
    )
  }
} else {
  chatModel = {
    model: models.chat?.model ?? FREE_CHAT_MODEL_ID,
    task: "chat",
    baseUrl: FREE_CHAT_BASE_URL,
    apiKey: FREE_CHAT_API_KEY,
    provider: FREE_CHAT_PROVIDER
  }
}

/** The resolved chat model name, as sent to the provider's API. */
export const chatModelId = chatModel.model

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
