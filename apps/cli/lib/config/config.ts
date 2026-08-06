import { join } from "node:path"
import { type KajaConfig, KajaConfigSchema, type KajaModels, type KajaPreferences } from "@kaja/schema/config"
import { file, write } from "bun"
// First-run settings.json template. Cast to string: resolveJsonModule mistypes this "text" import as parsed JSON.
import rawTemplate from "../../../../docs/config/settings.json" with { type: "text" }
import pkg from "../../package.json" with { type: "json" }
import { t } from "../i18n"
import { getPaths } from "../paths"

const TEMPLATE = rawTemplate as unknown as string
const TEMPLATE_JSON = JSON.parse(TEMPLATE)

// Injected at compile time by CI via `bun build --define CLI_VERSION=...`; undefined when running from source (see lib/args.ts for the same pattern).
declare const CLI_VERSION: string | undefined

// Pinned to this CLI's release tag so the schema matches what this version actually validates.
function getSchemaUrl() {
  const version = typeof CLI_VERSION === "string" ? CLI_VERSION : pkg.version
  return `https://cdn.jsdelivr.net/gh/SubZtep/kaja@cli@${version}/docs/config/settings.schema.json`
}

// Set at startup from --config-dir; only settings.json moves, other data paths stay default.
let configDirOverride: string | undefined

export function setConfigDirOverride(dir: string | undefined) {
  configDirOverride = dir
  cached = undefined
}

// Computed fresh per call, not cached — tests mutate XDG_CONFIG_HOME per spec file.
export function getConfigDir() {
  return configDirOverride ?? getPaths().config
}

export function getConfigPath() {
  return join(getConfigDir(), "settings.json")
}

export async function isExists() {
  const f = file(getConfigPath())
  return await f.exists()
}

export async function validate(quiet = false) {
  const f = file(getConfigPath(), { type: "application/json" })
  if (await f.exists()) {
    try {
      const data = await f.json()
      return !!KajaConfigSchema.parse(data)
    } catch (error) {
      if (!quiet) console.log(error)
    }
  }
  return false
}

/** Tolerant reader for the config wizard prefill: returns whatever is in the file (possibly schema-invalid), or {} when missing/unparseable. */
export async function readConfigLoose(): Promise<Partial<KajaConfig>> {
  try {
    const data = await file(getConfigPath(), {
      type: "application/json"
    }).json()
    if (data && typeof data === "object") return data as Partial<KajaConfig>
  } catch {}
  return {}
}

// Cached after the first read: the file only changes via saveConfig/savePreferences below (and invalidateConfigCache, for writers outside this module), so other readers (stt/tts/geo, called per-utterance) don't hit disk each time.
let cached: KajaConfig | undefined

/** Clears the config() cache after a write made outside saveConfig/savePreferences — e.g. lib/memory-store.ts persisting a resolved default path into settings.json. */
export function invalidateConfigCache() {
  cached = undefined
}

export async function config() {
  if (cached) return cached
  const configPath = getConfigPath()
  const f = file(configPath, { type: "application/json" })
  if (await f.exists()) {
    try {
      cached = (await f.json()) as KajaConfig
      return cached
    } catch (error: any) {
      console.log(t("config.invalidAt", { path: configPath, message: error.message }))
      process.exit(1)
    }
  } else {
    console.log(t("config.notExists", { path: configPath }))
    process.exit(1)
  }
}

export async function saveConfig(data: KajaConfig) {
  const f = file(getConfigPath(), { type: "application/json" })
  await write(f, JSON.stringify(data, null, 2))
  cached = undefined
}

export async function savePreferences(preferences: KajaPreferences) {
  const current = await config()
  const f = file(getConfigPath(), { type: "application/json" })
  // Merge into the existing block: callers persist only the keys they manage (thinking/sounds/voice) and must not drop others like language.
  await write(f, JSON.stringify({ ...current, preferences: { ...current.preferences, ...preferences } }, null, 2))
  cached = undefined
}

/** Merges into models.* — each task's whole {model, provider} pair is replaced, other tasks untouched. */
export async function saveModels(models: Partial<KajaModels>) {
  const current = await config()
  const f = file(getConfigPath(), { type: "application/json" })
  await write(f, JSON.stringify({ ...current, models: { ...current.models, ...models } }, null, 2))
  cached = undefined
}

/** Seeds settings.json's models.chat from a freshly fetched models.toml, only if no real chat model is set yet (placeholder doesn't count). */
export async function saveFetchedChatModel(chatModel: { model: string; provider?: string }) {
  const current = await readConfigLoose()
  const templateChatModel = (TEMPLATE_JSON as Partial<KajaConfig>).models?.chat
  const hasRealChat = !!current.models?.chat?.model && current.models.chat.model !== templateChatModel?.model
  if (hasRealChat) return
  const merged: Partial<KajaConfig> = {
    $schema: getSchemaUrl(),
    ...(TEMPLATE_JSON as Partial<KajaConfig>),
    ...current,
    models: { ...current.models, chat: chatModel }
  }
  const f = file(getConfigPath(), { type: "application/json" })
  await write(f, JSON.stringify(merged, null, 2))
  cached = undefined
}

/** @param freeChat Omits the template's placeholder models.chat, so it falls back to the free hosted tier. */
export async function create(freeChat = false) {
  const f = file(getConfigPath(), { type: "application/json" })
  const withSchema = { $schema: getSchemaUrl(), ...TEMPLATE_JSON }
  if (freeChat) {
    const { chat: _chat, ...otherModels } = withSchema.models
    withSchema.models = otherModels
  }
  await write(f, JSON.stringify(withSchema, null, 2))
}
