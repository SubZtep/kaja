import { join } from "node:path"
import { type SecretsFile, SecretsFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import TEMPLATE from "../../../../docs/config/secrets.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"
import { writeTemplateConfig } from "./fetch"

export function getSecretsPath() {
  return join(getConfigDir(), "secrets.toml")
}

/**
 * The `kaja config fetch` subcommand: writes the bundled docs/config/secrets.toml template (all commented-out
 * placeholders) when there's no secrets.toml yet; one with no values already reads the same, so it's left as it is. A file
 * holding any value, or one that doesn't parse, is `kept` as it is: the template has no keys to offer, so replacing it only ever lost the user's own. Never
 * served by the API — admin-managed config has no user secrets to export — so this is the only source `fetch` has for it.
 */
export async function fetchSecretsToml(): Promise<{
  path: string
  backedUpTo?: string
  unchanged?: boolean
  kept?: boolean
}> {
  const path = getSecretsPath()
  const f = file(path)
  if (await f.exists()) {
    let data: unknown
    try {
      data = TOML.parse(await f.text())
    } catch {
      return { path, kept: true }
    }
    if (data && typeof data === "object" && Object.keys(data).length > 0) return { path, kept: true }
  }
  return writeTemplateConfig(TEMPLATE, path)
}

/** Tolerant reader: returns whatever is in the file (possibly schema-invalid), or {} when missing/unparseable. */
export async function readSecretsLoose(): Promise<Partial<SecretsFile>> {
  try {
    const f = file(getSecretsPath())
    if (!(await f.exists())) return {}
    const data = TOML.parse(await f.text())
    if (data && typeof data === "object") return data as Partial<SecretsFile>
  } catch {}
  return {}
}

/** Loads and parses secrets.toml. Missing file: writes the commented-out template and parses that (empty). Invalid file: prints the error and exits, same policy as {@link import("./config").config}. */
export async function loadSecretsFile(): Promise<SecretsFile> {
  const secretsPath = getSecretsPath()
  const f = file(secretsPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    return SecretsFileSchema.parse(TOML.parse(text))
  } catch (error: any) {
    console.log(t("secrets.invalidAt", { path: secretsPath, message: error.message }))
    process.exit(1)
  }
}

// Cached after the first read: mirrors lib/config.ts's config() cache so per-utterance readers (stt/tts/geo) don't hit disk each time.
let cached: SecretsFile | undefined

/** Clears the secrets() cache after a write made outside this module. */
export function invalidateSecretsCache() {
  cached = undefined
}

export async function secrets(): Promise<SecretsFile> {
  if (cached) return cached
  cached = await loadSecretsFile()
  return cached
}

/** Merges a partial update into secrets.toml (e.g. a provider's api_key from the wizard) and invalidates the cache. Callers must not drop unrelated sections — pass only the keys being changed. */
export async function saveSecrets(update: Partial<SecretsFile>): Promise<void> {
  const current = await loadSecretsFile()
  const next: SecretsFile = {
    ...current,
    ...update,
    providers: { ...current.providers, ...update.providers },
    mcp: { ...current.mcp, ...update.mcp },
    abilities: { ...current.abilities, ...update.abilities }
  }
  await write(getSecretsPath(), TOML.stringify(next)!)
  cached = undefined
}
