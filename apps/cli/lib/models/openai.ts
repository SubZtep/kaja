import {
  createOpenAIClient,
  FREE_CHAT_API_KEY,
  FREE_CHAT_BASE_URL,
  FREE_CHAT_MODEL_ID,
  FREE_CHAT_PROVIDER,
  KAJA_ZEN_KEY_HEADER
} from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { services } from "../config/services"
import { findModelById, loadModelsFile, resolveModels } from "./models"

export {
  createOpenAIClient,
  FREE_CHAT_PROVIDER,
  KAJA_MODEL_HEADER,
  noteServedModel,
  takeLastServedModel
} from "@kaja/nasi"

const modelsFile = await loadModelsFile()
const { zen } = await services()
export const isFreeChat = !modelsFile.active.chat
let chatModel: CliResolvedModel
if (modelsFile.active.chat) {
  const resolved = findModelById(resolveModels(modelsFile), modelsFile.active.chat, "chat")
  if (!resolved) {
    throw new Error(
      `models.toml's [active].chat names model id "${modelsFile.active.chat}", which isn't in [models.*] (or isn't a chat-task entry)`
    )
  }
  chatModel = resolved
} else {
  chatModel = {
    id: FREE_CHAT_PROVIDER,
    model: FREE_CHAT_MODEL_ID,
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
