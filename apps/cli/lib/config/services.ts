import { join } from "node:path"
import { type ServicesFile, ServicesFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import TEMPLATE from "../../../../docs/config/services.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"
import { secrets } from "./secrets"

export function getServicesPath() {
  return join(getConfigDir(), "services.toml")
}

/** Tolerant reader: returns whatever is in the file (possibly schema-invalid), or {} when missing/unparseable. */
export async function readServicesLoose(): Promise<Partial<ServicesFile>> {
  try {
    const f = file(getServicesPath())
    if (!(await f.exists())) return {}
    const data = TOML.parse(await f.text())
    if (data && typeof data === "object") return data as Partial<ServicesFile>
  } catch {}
  return {}
}

/** services.toml's non-secret config, with secrets.toml's matching credentials folded back in — the shape every consumer (web-search, geo, telegram, openai) actually reads. */
export type ResolvedServices = ServicesFile & {
  api?: ServicesFile["api"] & { token?: string }
  location?: ServicesFile["location"] & { apiKey: string }
  telegram?: ServicesFile["telegram"] & { botToken: string }
  webSearch?: { apiKey: string }
  zen?: { apiKey: string }
}

/** Folds secrets.toml's credentials into services.toml's parsed sections, so no consumer needs to change. */
function mergeSecrets(parsed: ServicesFile, creds: Awaited<ReturnType<typeof secrets>>): ResolvedServices {
  return {
    ...parsed,
    api: parsed.api ? { ...parsed.api, token: creds.api?.token } : undefined,
    location: parsed.location && creds.location ? { ...parsed.location, apiKey: creds.location.apiKey } : undefined,
    telegram: parsed.telegram && creds.telegram ? { ...parsed.telegram, botToken: creds.telegram.botToken } : undefined,
    webSearch: creds.webSearch,
    zen: creds.zen
  }
}

/** Loads and parses services.toml, then folds in secrets.toml's credentials. Missing file: writes the commented-out template and parses that (empty). Invalid file: prints the error and exits, same policy as {@link import("./config").config}. */
export async function loadServicesFile(): Promise<ResolvedServices> {
  const servicesPath = getServicesPath()
  const f = file(servicesPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    const parsed = ServicesFileSchema.parse(TOML.parse(text))
    return mergeSecrets(parsed, await secrets())
  } catch (error: any) {
    console.log(t("services.invalidAt", { path: servicesPath, message: error.message }))
    process.exit(1)
  }
}

// Cached after the first read: mirrors lib/config.ts's config() cache so per-utterance readers (stt/tts/geo) don't hit disk each time.
let cached: ResolvedServices | undefined

/** Clears the services() cache after a write made outside this module. */
export function invalidateServicesCache() {
  cached = undefined
}

export async function services(): Promise<ResolvedServices> {
  if (cached) return cached
  cached = await loadServicesFile()
  return cached
}
