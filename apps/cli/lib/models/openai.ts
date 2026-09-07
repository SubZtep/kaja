import { createOpenAIClient } from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { findModelById, loadModelsFile, resolveModels } from "./models"

export { createOpenAIClient, KAJA_MODEL_HEADER, noteServedModel, takeLastServedModel } from "@kaja/nasi"

const modelsFile = await loadModelsFile()
const chatEntry = findModelById(resolveModels(modelsFile), "chat", "chat")
export const isFreeChat = !chatEntry

// chatEntry is only undefined when isFreeChat is true, which every caller of chatModelId/client
// below (app.tsx, tools/*, telegram/cli.ts) is prevented from reaching by requireConfiguredProvider().
export const chatModelId = chatEntry?.model ?? ""

export const client = createOpenAIClient({
  apiKey: chatEntry?.apiKey ?? "unused",
  baseURL: chatEntry?.baseUrl ?? ""
})

export function clientForModel(model: CliResolvedModel) {
  return createOpenAIClient({
    baseURL: model.baseUrl,
    apiKey: model.apiKey ?? "unused"
  })
}
