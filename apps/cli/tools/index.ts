import { createTools, setDatasetLoaders } from "@kaja/nasi"
import { tryLookupMyLocation } from "../lib/agent/geo"
import { loadPluginTools } from "../lib/agent/plugin-tools"
import { config } from "../lib/config/config"
import { loadMcpServers } from "../lib/config/mcp-servers"
import { services } from "../lib/config/services"
import { loadModelsFile, resolveModelFromConfig } from "../lib/models/models"
import { chatModelId, client } from "../lib/models/openai"
import { getPaths } from "../lib/paths"
import { loadDataset, loadDatasets } from "../lib/personas/datasets"

export async function getDefaultTools() {
  const { models } = await config()
  const { webSearch } = await services()
  const [mcpServers, pluginTools] = await Promise.all([loadMcpServers(), loadPluginTools()])
  setDatasetLoaders({ loadDataset, loadDatasets })

  const modelsFile = await loadModelsFile().catch(() => undefined)
  const rerank =
    models.rerank?.provider && modelsFile ? resolveModelFromConfig(modelsFile, models.rerank, "rerank") : undefined
  const imageGeneration =
    models["image-generation"]?.provider && modelsFile
      ? resolveModelFromConfig(modelsFile, models["image-generation"], "image-generation")
      : undefined

  const created = await createTools({
    profile: "local",
    tempDir: getPaths().temp,
    mcpServers,
    deps: {
      chat: { client, model: chatModelId },
      rerank: rerank ?? undefined,
      imageGeneration: imageGeneration ?? undefined,
      webSearchApiKey: webSearch?.apiKey,
      lookupLocation: tryLookupMyLocation,
      tempDir: getPaths().temp
    }
  })

  return {
    tools: [...created.tools, ...pluginTools],
    mcpServers: created.mcpServers,
    closeTools: created.closeTools
  }
}
