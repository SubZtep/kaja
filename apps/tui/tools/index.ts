import {
  createFolderAbilityStore,
  createTools,
  type ImageGenModel,
  loadAbilities,
  type RerankModel,
  setDatasetLoaders
} from "@kaja/nasi"
import type { Persona } from "@kaja/schema/cli"
import { getMarketplaceDir } from "../lib/abilities/abilities-file"
import { sandboxedAbilities, sandboxRelay, signedOutSandbox } from "../lib/abilities/sandbox-relay"
import { secrets } from "../lib/config/secrets"
import { peekStorePath, resolveMemoryDbPath } from "../lib/memory/store"
import { loadModelsFile, resolveActiveModel } from "../lib/models/models"
import { chatModelId, client, summarizer } from "../lib/models/openai"
import { getBackupDir, getPaths } from "../lib/paths"
import { loadDataset, loadDatasets } from "../lib/personas/datasets"

/** Every tool the local agent gets. `lazyMcp` (default) leaves abilities' MCP servers for `ensureAbilities` to connect once a persona that uses them is active; the doctor turns it off to test them all. */
export async function getDefaultTools(personas: Persona[], { lazyMcp = true }: { lazyMcp?: boolean } = {}) {
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

  // Every ability in the marketplace folder loads; the active persona decides which of them a chat gets.
  const { abilities: abilitySecrets } = await secrets()
  const keyOf = (name: string) => abilitySecrets[name]?.api_key
  // Abilities set to run on a sandbox reach it through the Kaja API; signed out, they're off rather than started here.
  const onSandbox = new Set(await sandboxedAbilities())
  const relay = onSandbox.size ? await sandboxRelay(keyOf) : undefined
  const sandbox = onSandbox.size ? (relay ?? signedOutSandbox) : undefined
  const abilities = await loadAbilities(createFolderAbilityStore({ root: getMarketplaceDir() }), {
    personas,
    getApiKey: keyOf,
    mcpSandbox: sandbox,
    sandboxed: name => onSandbox.has(name),
    // Local mode: HTTP tools may call hosts on the user's own network (Home Assistant, a NAS, Ollama).
    allowPrivate: true,
    // The folder is every ability there is, so a persona naming another is a typo worth a warning.
    warnUnknown: true
  })

  const tools = await createTools({
    includeLocalTools: true,
    extraTools: abilities.groups,
    mcpAbilities: abilities.mcp,
    lazyMcpAbilities: lazyMcp,
    ...(sandbox ? { mcpFetch: () => sandbox.fetch } : {}),
    backupDir: getBackupDir(),
    deps: {
      chat: { client, model: chatModelId },
      summarizer,
      rerank,
      imageGeneration,
      tempDir: getPaths().temp,
      storePath: peekStorePath() ?? (await resolveMemoryDbPath())
    }
  })
  // Stdio abilities nothing here can start, and roots-taking ones no persona gives a folder: the doctor says so.
  return {
    ...tools,
    missingRunners: abilities.missingRunners,
    missingRoots: abilities.missingRoots,
    // Set to run on a sandbox while signed out of Kaja cloud: off this session.
    signedOutSandboxed: relay ? [] : [...onSandbox]
  }
}
