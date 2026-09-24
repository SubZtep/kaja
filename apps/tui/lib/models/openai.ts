import { createOpenAIClient } from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { config } from "../config/config"
import { findModelById, loadModelsFile, resolveModels } from "./models"

export { createOpenAIClient } from "@kaja/nasi"

const modelsFile = await loadModelsFile()
const resolvedModels = resolveModels(modelsFile)
const chatEntry = findModelById(resolvedModels, "chat", "chat")
const summarizeEntry = findModelById(resolvedModels, "summarize", "summarize")
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

/** [models.summarize], which writes the summaries a long conversation is compacted into; unset means the chat model does. */
export const summarizer = summarizeEntry && {
  client: clientForModel(summarizeEntry),
  model: summarizeEntry.model,
  contextWindow: summarizeEntry.contextWindow
}

/** settings.toml `[context] compact_at`: how full the context may get before compacting. */
export const compactAt = (await config()).context?.compact_at
