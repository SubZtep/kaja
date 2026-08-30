import {
  createOpenAIClient,
  FREE_CHAT_API_KEY,
  FREE_CHAT_BASE_URL,
  FREE_CHAT_MODEL_ID,
  FREE_CHAT_PROVIDER,
  KAJA_MODEL_HEADER,
  KAJA_ZEN_KEY_HEADER,
  noteServedModel,
  takeLastServedModel
} from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { config } from "../config/config"
import { services } from "../config/services"
import { loadModelsFile, resolveModelFromConfig } from "./models"

export { createOpenAIClient, FREE_CHAT_PROVIDER, KAJA_MODEL_HEADER, noteServedModel, takeLastServedModel }

const { models } = await config()
const { zen } = await services()
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

export const chatModelId = chatModel.model

export const client = createOpenAIClient({
  apiKey: chatModel.apiKey ?? "unused",
  baseURL: chatModel.baseUrl,
  headers: isFreeChat && zen?.apiKey ? { [KAJA_ZEN_KEY_HEADER]: zen.apiKey } : undefined
})

export function clientForModel(model: CliResolvedModel) {
  return createOpenAIClient({
    baseURL: model.baseUrl,
    apiKey: model.apiKey ?? "unused",
    headers: isFreeChat && zen?.apiKey ? { [KAJA_ZEN_KEY_HEADER]: zen.apiKey } : undefined
  })
}
