import OpenAI from "openai"
import { config } from "./config"
import { loadModelsFile, resolveModelById } from "./models"

const { models } = await config()
const chatModel = resolveModelById(await loadModelsFile(), models.chat)
if (!chatModel) {
  throw new Error(`No model in models.toml matches config.json's models.chat ("${models.chat}")`)
}

/** The resolved chat model name, as sent to the provider's API. */
export const chatModelId = chatModel.id

export const client = new OpenAI({
  apiKey: chatModel.apiKey,
  baseURL: chatModel.baseUrl
})
