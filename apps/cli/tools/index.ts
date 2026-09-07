import { join } from "node:path"
import { createTools, type ImageGenModel, type RerankModel, setDatasetLoaders } from "@kaja/nasi"
import type { Persona } from "@kaja/schema/cli"
import { tryLookupMyLocation } from "../lib/agent/geo"
import { getConfigDir } from "../lib/config/config"
import { loadMcpServers } from "../lib/config/mcp-servers"
import { services } from "../lib/config/services"
import { peekStorePath, resolveMemoryDbPath } from "../lib/memory/store"
import { loadModelsFile, resolveActiveModel } from "../lib/models/models"
import { chatModelId, client } from "../lib/models/openai"
import { getPaths } from "../lib/paths"
import { loadDataset, loadDatasets } from "../lib/personas/datasets"

export async function getDefaultTools(personas: Persona[]) {
  const { webSearch } = await services()
  const mcpServers = await loadMcpServers()
  setDatasetLoaders({ loadDataset, loadDatasets })

  const modelsFile = await loadModelsFile().catch(() => undefined)
  const personaById = new Map(personas.map(p => [p.id, p]))

  const rerank = modelsFile
    ? (personaId?: string): RerankModel | undefined => {
        const resolved = resolveActiveModel(modelsFile, "rerank", personaById.get(personaId ?? "")?.models)
        return resolved ? { model: resolved.model, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey } : undefined
      }
    : undefined
  const imageGeneration = modelsFile
    ? (personaId?: string): ImageGenModel | undefined => {
        const resolved = resolveActiveModel(modelsFile, "image-generation", personaById.get(personaId ?? "")?.models)
        return resolved ? { model: resolved.model, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey } : undefined
      }
    : undefined

  return createTools({
    includeLocalTools: true,
    mcpServers,
    pluginDir: join(getConfigDir(), "tools"),
    deps: {
      chat: { client, model: chatModelId },
      rerank,
      imageGeneration,
      webSearchApiKey: webSearch?.apiKey,
      lookupLocation: tryLookupMyLocation,
      tempDir: getPaths().temp,
      storePath: peekStorePath() ?? (await resolveMemoryDbPath())
    }
  })
}
