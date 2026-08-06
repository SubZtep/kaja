import OpenAI from "openai"
import { config } from "../config/config"
import { loadModelsFile, resolveModelById } from "./models"

// Sentinel models.chat value for the free hosted chat tier: resolved here
// directly instead of via models.toml, since it has no per-user provider
// config to look up — just a shared public endpoint.
export const FREE_CHAT_MODEL_ID = "kaja-free-chat"
const FREE_CHAT_BASE_URL = "https://openai.kaja.io"
const FREE_CHAT_API_KEY = "kaja"

/** Free-chat proxy sets this to the model it resolved and put in the request. */
export const KAJA_MODEL_HEADER = "x-kaja-model"

const { models } = await config()
const chatModel =
  models.chat === FREE_CHAT_MODEL_ID
    ? { id: models.chat, task: "chat" as const, baseUrl: FREE_CHAT_BASE_URL, apiKey: FREE_CHAT_API_KEY }
    : resolveModelById(await loadModelsFile(), models.chat)
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
export function createOpenAIClient(opts: { baseURL: string; apiKey: string }): OpenAI {
  return new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    fetch: async (input, init) => {
      const res = await fetch(input, init)
      const served = res.headers.get(KAJA_MODEL_HEADER)
      if (served) noteServedModel(served)
      return res
    }
  })
}

export const client = createOpenAIClient({
  apiKey: chatModel.apiKey ?? "unused",
  baseURL: chatModel.baseUrl
})
