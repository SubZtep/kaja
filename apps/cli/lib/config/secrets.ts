import { join } from "node:path"
import { type SecretsFile, SecretsFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import TEMPLATE from "../../../../docs/config/secrets.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"

export function getSecretsPath() {
  return join(getConfigDir(), "secrets.toml")
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
