import type { PersonaModels } from "@kaja/schema/cli"
import OpenAI from "openai"
import { loadModelsFile, resolveActiveModel } from "./models"

/**
 * Generates embeddings via the model configured at models.toml's
 * [active].embedding (or the active persona's pin, if set). Batches multiple
 * inputs into one request.
 */
export async function embed(input: string | string[], personaModels?: PersonaModels): Promise<number[][]> {
  const embedding = resolveActiveModel(await loadModelsFile(), "embedding", personaModels)
  if (!embedding) {
    throw new Error("No embedding model configured — set [active].embedding in models.toml")
  }
  const client = new OpenAI({
    baseURL: embedding.baseUrl,
    apiKey: embedding.apiKey
  })
  const res = await client.embeddings.create({
    model: embedding.model,
    input,
    // Without this, the SDK defaults to requesting base64-encoded vectors and decodes them client-side — explicit "float" gets plain JSON number[] directly, matching what Fireworks (and this codebase's own JSON-in-TEXT storage convention) actually returns/expects.
    encoding_format: "float"
  })
  return res.data.map(d => d.embedding)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
