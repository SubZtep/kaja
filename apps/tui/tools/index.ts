import { join } from "node:path"
import {
  createFolderAbilityStore,
  createTools,
  type ImageGenModel,
  loadAbilities,
  type RerankModel,
  setDatasetLoaders
} from "@kaja/nasi"
import type { Persona } from "@kaja/schema/cli"
import { getMarketplaceDir, loadAbilitiesFile } from "../lib/abilities/abilities-file"
import { getConfigDir } from "../lib/config/config"
import { loadMcpServers } from "../lib/config/mcp-servers"
import { secrets } from "../lib/config/secrets"
import { peekStorePath, resolveMemoryDbPath } from "../lib/memory/store"
import { loadModelsFile, resolveActiveModel } from "../lib/models/models"
import { chatModelId, client } from "../lib/models/openai"
import { getPaths } from "../lib/paths"
import { loadDataset, loadDatasets } from "../lib/personas/datasets"

export async function getDefaultTools(personas: Persona[]) {
  const { webSearch } = await secrets()
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

  const abilitiesFile = await loadAbilitiesFile()
  const { abilities: abilitySecrets } = await secrets()
  const abilities = await loadAbilities(
    createFolderAbilityStore({
      root: getMarketplaceDir(),
      enabled: { skills: abilitiesFile.skills, tools: abilitiesFile.tools, mcp: abilitiesFile.mcp }
    }),
    {
      personas,
      getApiKey: name => abilitySecrets[name]?.apiKey,
      // Local mode: HTTP tools may call hosts on the user's own network (Home Assistant, a NAS, Ollama).
      allowPrivate: true
    }
  )

  return createTools({
    includeLocalTools: true,
    extraTools: abilities.groups,
    mcpAbilities: abilities.mcp,
    mcpServers,
    pluginDir: join(getConfigDir(), "tools"),
    deps: {
      chat: { client, model: chatModelId },
      rerank,
      imageGeneration,
      webSearchApiKey: webSearch?.apiKey,
      tempDir: getPaths().temp,
      storePath: peekStorePath() ?? (await resolveMemoryDbPath())
    }
  })
}
