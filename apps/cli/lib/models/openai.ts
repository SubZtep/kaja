import OpenAI from "openai"
import { config } from "../config/config"
import { loadModelsFile, resolveModelById } from "./models"

// Sentinel models.chat value for the free hosted chat tier: resolved here
// directly instead of via models.toml, since it has no per-user provider
// config to look up — just a shared public endpoint.
export const FREE_CHAT_MODEL_ID = "kaja-free-chat"
const FREE_CHAT_BASE_URL = "https://openai.kaja.io"
const FREE_CHAT_API_KEY = "kaja"

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

export const client = new OpenAI({
  apiKey: chatModel.apiKey,
  baseURL: chatModel.baseUrl
})
