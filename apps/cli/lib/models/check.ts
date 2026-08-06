import type { CliResolvedModel } from "@kaja/schema/config"
import OpenAI from "openai"

/**
 * Confirms a model is servable: chat/embedding use a real 1-token/1-word
 * request (GET /models omits some servable models on Fireworks); speaches
 * STT probes via POST /v1/models/{id}; everything else falls back to GET /models.
 */
export async function checkModelAvailability(model: CliResolvedModel): Promise<boolean> {
  const client = new OpenAI({
    apiKey: model.apiKey ?? "none",
    baseURL: model.baseUrl
  })
  try {
    if (model.task === "chat") {
      await client.chat.completions.create({
        model: model.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
      return true
    }
    if (model.task === "embedding") {
      await client.embeddings.create({
        model: model.model,
        input: "hi",
        encoding_format: "float"
      })
      return true
    }
    if (model.task === "speech-to-text") {
      const res = await fetch(`${model.baseUrl}/v1/models/${encodeURIComponent(model.model)}`, { method: "POST" })
      return res.ok
    }
    const page = await client.models.list()
    return page.data.some(entry => entry.id === model.model)
  } catch {
    return false
  }
}
