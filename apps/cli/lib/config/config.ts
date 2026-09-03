import { join } from "node:path"
import { type KajaConfig, KajaConfigSchema, type KajaPreferences } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import rawTemplate from "../../../../docs/config/settings.toml" with { type: "text" }
import { t } from "../i18n"
import { getPaths } from "../paths"

const TEMPLATE = rawTemplate as unknown as string
const TEMPLATE_TOML = TOML.parse(TEMPLATE)

/** Test-only override: lets specs point config reads at a fresh temp directory instead of XDG_CONFIG_HOME. */
let configDirOverride: string | undefined

export function setConfigDirOverride(dir: string | undefined) {
  configDirOverride = dir
  cached = undefined
}

/** Computed fresh per call, not cached — tests mutate XDG_CONFIG_HOME per spec file. */
export function getConfigDir() {
  return configDirOverride ?? getPaths().config
}

export function getConfigPath() {
  return join(getConfigDir(), "settings.toml")
}

export async function isConfigExists() {
  const f = file(getConfigPath())
  return await f.exists()
}

export async function validate() {
  const f = file(getConfigPath())
  if (!(await f.exists())) return false

  let data
  try {
    data = TOML.parse(await f.text())
  } catch {
    return false
  }

  return KajaConfigSchema.safeParse(data).success
}

/** Tolerant reader for the config wizard prefill: returns whatever is in the file (possibly schema-invalid), or {} when missing/unparseable. */
export async function readConfigLoose(): Promise<Partial<KajaConfig>> {
  try {
    const data = TOML.parse(await file(getConfigPath()).text())
    if (data && typeof data === "object") return data as Partial<KajaConfig>
  } catch {}
  return {}
}

/** Cached after the first read: the file only changes via saveConfig/savePreferences below (and invalidateConfigCache, for writers outside this module), so other readers (stt/tts/geo, called per-utterance) don't hit disk each time. */
let cached: KajaConfig | undefined

/** Clears the config() cache after a write made outside saveConfig/savePreferences — e.g. lib/memory-store.ts persisting a resolved default path into settings.toml. */
export function invalidateConfigCache() {
  cached = undefined
}

export async function config() {
  if (cached) return cached
  const configPath = getConfigPath()
  const f = file(configPath)
  if (await f.exists()) {
    try {
      cached = TOML.parse(await f.text()) as unknown as KajaConfig
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
  await write(getConfigPath(), TOML.stringify(data)!)
  cached = undefined
}

export async function savePreferences(preferences: KajaPreferences) {
  const current = await config()
  // Merge into the existing block: callers persist only the keys they manage (thinking/sounds/voice) and must not drop others like language.
  await write(getConfigPath(), TOML.stringify({ ...current, preferences: { ...current.preferences, ...preferences } })!)
  cached = undefined
}

/** The last signed-in hosted (--remote) user's email, if any. Reads tolerantly since settings.toml may not exist yet for hosted-only users. */
export async function getCurrentUser(): Promise<string | undefined> {
  const current = await readConfigLoose()
  return current.user
}

/** Persists the current hosted (--remote) user's email, creating settings.toml if it doesn't exist yet (hosted-only users have none). */
export async function saveCurrentUser(user: string): Promise<void> {
  const current = await readConfigLoose()
  await write(getConfigPath(), TOML.stringify({ ...current, user })!)
  cached = undefined
}

export async function create() {
  await write(getConfigPath(), TOML.stringify(TEMPLATE_TOML)!)
}
