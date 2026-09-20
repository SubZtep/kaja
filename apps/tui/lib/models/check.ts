import type { CliResolvedModel } from "@kaja/schema/config"
import OpenAI from "openai"

/**
 * Like {@link checkModelAvailability}, but says why it failed (e.g. "401 Incorrect API key",
 * "Connection error."). `status` is the provider's HTTP status when there was one — absent for a
 * connection that never landed, which is how callers tell a refused key from an unreachable server.
 */
export async function probeModel(
  model: CliResolvedModel
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  try {
    if (await checkModelAvailabilityOrThrow(model)) return { ok: true }
    return { ok: false, error: "not listed by the provider" }
  } catch (error) {
    // OpenAI's APIError carries the response status; APIConnectionError leaves it undefined.
    const status = error instanceof OpenAI.APIError ? error.status : undefined
    return { ok: false, error: error instanceof Error ? error.message : String(error), status }
  }
}

/**
 * Confirms a model is servable: chat/embedding use a real 1-token/1-word
 * request (GET /models omits some servable models on Fireworks); speaches
 * STT probes via POST /v1/models/{id}; everything else falls back to GET /models.
 */
export async function checkModelAvailability(model: CliResolvedModel): Promise<boolean> {
  try {
    return await checkModelAvailabilityOrThrow(model)
  } catch {
    return false
  }
}

async function checkModelAvailabilityOrThrow(model: CliResolvedModel): Promise<boolean> {
  const client = new OpenAI({
    apiKey: model.apiKey ?? "none",
    baseURL: model.baseUrl
  })
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
  if (model.task === "stt") {
    const res = await fetch(`${model.baseUrl}/v1/models/${encodeURIComponent(model.model)}`, { method: "POST" })
    return res.ok
  }
  const page = await client.models.list()
  return page.data.some(entry => entry.id === model.model)
}
