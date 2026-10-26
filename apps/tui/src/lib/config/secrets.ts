import { join } from "node:path"
import { type SecretsFile, SecretsFileSchema, type SecretsTelegram } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { t } from "../i18n"
import { makePrivate } from "../private-file"
import { getConfigDir } from "./config"
import { withSchemaLine, writeConfigFile } from "./schema-file"
import { groupTomlTables, stringifyToml } from "./toml"

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
  } catch {
    // unreadable secrets file: treated as empty
  }
  return {}
}

/**
 * Loads and parses secrets.toml; a missing one holds no keys. Invalid file: prints the error and exits, same policy as
 * {@link import("./config").config}.
 */
export async function loadSecretsFile(): Promise<SecretsFile> {
  const secretsPath = getSecretsPath()
  const f = file(secretsPath)
  const exists = await f.exists()
  // A file written before Kaja kept it private (or edited by hand) is fixed the next time it's read
  if (exists) await makePrivate(secretsPath)
  const text = exists ? await f.text() : ""
  try {
    return SecretsFileSchema.parse(TOML.parse(text))
  } catch (error) {
    console.log(
      t("secrets.invalidAt", { path: secretsPath, message: error instanceof Error ? error.message : String(error) })
    )
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

/** A key the config uses but has no value for: kept in secrets.toml as a commented-out table, ready to fill in. */
export type SecretPlaceholder = { group: "providers" | "abilities"; name: string; note?: string }

const PLACEHOLDER_GROUPS = ["providers", "abilities"] as const

// A table name as TOML writes it: bare when it can be, quoted otherwise.
function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : JSON.stringify(name)
}

// One placeholder's lines: its note, then the table with an empty api_key, all commented out.
function placeholderText({ group, name, note }: SecretPlaceholder): string {
  return [...(note ? [`# ${note}`] : []), `# [${group}.${tomlKey(name)}]`, `# api_key = ""`].join("\n")
}

const PLACEHOLDER_HEADER = /^\s*#\s*\[(providers|abilities)\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\]\s*$/
const PLACEHOLDER_KEY = /^\s*#\s*api_key\s*=\s*""\s*$/
const NOTE = /^\s*#(.*)$/

/**
 * The placeholders in secrets.toml text: a commented-out `[providers.<name>]` or `[abilities.<name>]` followed by `#
 * api_key = ""`, with the comment line above it as its note.
 */
export function readSecretPlaceholders(text: string): SecretPlaceholder[] {
  const lines = text.split("\n")
  const found: SecretPlaceholder[] = []
  lines.forEach((line, index) => {
    const header = PLACEHOLDER_HEADER.exec(line)
    if (!(header && PLACEHOLDER_KEY.test(lines[index + 1] ?? ""))) return
    const above = lines[index - 1] ?? ""
    const note = !/^\s*#\s*\[/.test(above) ? NOTE.exec(above)?.[1]?.trim() : undefined
    found.push({
      group: header[1] as SecretPlaceholder["group"],
      name: (header[2] ?? header[3])!,
      ...(note ? { note } : {})
    })
  })
  return found
}

/**
 * Secrets.toml's text: the values grouped like every TOML Kaja writes, with each placeholder commented out in its
 * group.
 */
export function secretsText(data: SecretsFile, placeholders: SecretPlaceholder[] = []): string {
  const { providers, abilities, ...rest } = data
  const blocks = [stringifyToml(rest).trimEnd()].filter(Boolean)
  for (const group of PLACEHOLDER_GROUPS) {
    const values = { providers, abilities }[group]
    // Each set key as its own `[group.name]` table, for groupTomlTables to indent under the group's header.
    const real = Object.entries(values).map(([name, value]) =>
      (TOML.stringify({ [group]: { [name]: value } }) ?? "").trimEnd()
    )
    const missing = placeholders.filter(p => p.group === group && !(p.name in values)).map(placeholderText)
    if (real.length + missing.length === 0) continue
    // With nothing set in the group, its header is commented out too, so the file still parses to no tables.
    blocks.push(groupTomlTables(real.length > 0 ? `[${group}]` : `# [${group}]`, [...real, ...missing]))
  }
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : ""
}

/**
 * Merges a partial update into secrets.toml (e.g. a provider's api_key from the wizard) and invalidates the cache.
 * Callers must not drop unrelated sections — pass only the keys being changed. The file's placeholders are kept (one
 * that now has a value drops out), unless `placeholders` replaces them: the key check passes every key it found unset.
 */
export async function saveSecrets(
  update: Omit<Partial<SecretsFile>, "telegram"> & { telegram?: Partial<SecretsTelegram> },
  placeholders?: SecretPlaceholder[]
): Promise<void> {
  const current = await loadSecretsFile()
  const next: SecretsFile = {
    ...current,
    ...update,
    // A new token keeps the paired owners, and pairing keeps the token.
    telegram: update.telegram ? ({ ...current.telegram, ...update.telegram } as SecretsTelegram) : current.telegram,
    providers: { ...current.providers, ...update.providers },
    abilities: { ...current.abilities, ...update.abilities }
  }
  const f = file(getSecretsPath())
  const existing = (await f.exists()) ? await f.text() : ""
  const kept = placeholders ?? readSecretPlaceholders(existing)
  const text = secretsText(next, kept)
  if (existing !== withSchemaLine(getSecretsPath(), text)) await writeConfigFile(getSecretsPath(), text)
  await makePrivate(getSecretsPath())
  cached = undefined
}

/** Replaces secrets.toml's placeholders with these; the file is left untouched when they're already the ones it holds. */
export async function updateSecretPlaceholders(placeholders: SecretPlaceholder[]): Promise<void> {
  const f = file(getSecretsPath())
  const current = (await f.exists()) ? readSecretPlaceholders(await f.text()) : []
  const same = (a: SecretPlaceholder[], b: SecretPlaceholder[]) => JSON.stringify(a) === JSON.stringify(b)
  const sorted = (list: SecretPlaceholder[]) =>
    [...list].sort((a, b) => `${a.group}.${a.name}`.localeCompare(`${b.group}.${b.name}`))
  if (same(sorted(current), sorted(placeholders))) return
  await saveSecrets({}, placeholders)
}
