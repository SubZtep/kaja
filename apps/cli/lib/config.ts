import { join } from "node:path"
import { file, write } from "bun"
// Written on first run: a template config.json with placeholder model ids,
// or with models.chat overridden by the first-run prompt (see cli.tsx /
// components/first-run-setup.tsx). TS's built-in resolveJsonModule typing
// wins over the `text` attribute, so the raw import is typed as the parsed
// object rather than a string.
import rawTemplate from "../../../docs/config/config.json" with { type: "text" }
import pkg from "../package.json" with { type: "json" }
import { type KajaConfig, KajaConfigSchema, type KajaSettings } from "../schemas/config"
import { t } from "./i18n"
import { getPaths } from "./paths"

const TEMPLATE = rawTemplate as unknown as string
const TEMPLATE_JSON = JSON.parse(TEMPLATE)

// Injected at compile time by CI via `bun build --define CLI_VERSION=...`;
// undefined when running from source (see lib/args.ts for the same pattern).
declare const CLI_VERSION: string | undefined

// Pinned to the release tag (auto-version.yaml tags releases as
// `cli@X.Y.Z`), so the schema always matches the shape this installed CLI
// version actually validates, even after the schema changes in later
// releases.
function getSchemaUrl() {
  const version = typeof CLI_VERSION === "string" ? CLI_VERSION : pkg.version
  return `https://raw.githubusercontent.com/SubZtep/kaja/cli@${version}/docs/config/config.schema.json`
}

// Set once at startup from the --config-dir flag, pre-scanned from argv in
// cli.tsx before the first config read; only config.json moves — data paths
// (sessions, memory, logs) stay on their env-paths defaults.
let configDirOverride: string | undefined

export function setConfigDirOverride(dir: string | undefined) {
  configDirOverride = dir
  cached = undefined
}

// Computed fresh on every call rather than as a module-level constant: tests
// run many spec files in one process and mutate XDG_CONFIG_HOME per file, so
// a frozen constant would lock in whichever file happened to import this
// module first, for the rest of the process.
export function getConfigDir() {
  return configDirOverride ?? getPaths().config
}

export function getConfigPath() {
  return join(getConfigDir(), "config.json")
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

// Tolerant reader for the config wizard prefill: returns whatever is in the
// file (possibly schema-invalid), or {} when missing/unparseable.
export async function readConfigLoose(): Promise<Partial<KajaConfig>> {
  try {
    const data = await file(getConfigPath(), {
      type: "application/json"
    }).json()
    if (data && typeof data === "object") return data as Partial<KajaConfig>
  } catch {}
  return {}
}

// Cached after the first read: the file only changes via saveConfig/
// saveSettings below (and invalidateConfigCache, for writers outside this
// module), so every other reader (stt/tts/geo, called often and
// per-utterance) doesn't hit disk each time.
let cached: KajaConfig | undefined

/** Clears the config() cache after a write made outside saveConfig/saveSettings — e.g. lib/memory-store.ts persisting a resolved default path into config.json. */
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

export async function saveSettings(settings: KajaSettings) {
  const current = await config()
  const f = file(getConfigPath(), { type: "application/json" })
  // Merge into the existing block: callers persist only the keys they manage
  // (thinking/sounds/voice) and must not drop others like language.
  await write(f, JSON.stringify({ ...current, settings: { ...current.settings, ...settings } }, null, 2))
  cached = undefined
}

/**
 * Seeds config.json's models.chat from a freshly fetched models.toml,
 * without requiring the rest of the file to be schema-valid first — unlike
 * saveConfig/saveSettings, this must work even on a fresh install before
 * models.chat resolves (see lib/config-cli.ts). Only writes when the file
 * on disk doesn't already have a real chat id — the template's own
 * placeholder doesn't count, so it never blocks the real fetched one from
 * being seeded.
 */
export async function saveFetchedChatModel(chatModelId: string) {
  const current = await readConfigLoose()
  const templateChatId = (TEMPLATE_JSON as Partial<KajaConfig>).models?.chat
  const hasRealChat = !!current.models?.chat && current.models.chat !== templateChatId
  if (hasRealChat) return
  const merged: Partial<KajaConfig> = {
    $schema: getSchemaUrl(),
    ...(TEMPLATE_JSON as Partial<KajaConfig>),
    ...current,
    models: { ...current.models, chat: chatModelId }
  }
  const f = file(getConfigPath(), { type: "application/json" })
  await write(f, JSON.stringify(merged, null, 2))
  cached = undefined
}

/** @param chatModelId Overrides the template's placeholder models.chat, e.g. for the free hosted tier. */
export async function create(chatModelId?: string) {
  const f = file(getConfigPath(), { type: "application/json" })
  const withSchema = { $schema: getSchemaUrl(), ...TEMPLATE_JSON }
  if (chatModelId) withSchema.models = { ...withSchema.models, chat: chatModelId }
  await write(f, JSON.stringify(withSchema, null, 2))
}
