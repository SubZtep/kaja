import { join } from "node:path"
import { type ServicesFile, ServicesFileSchema } from "@kaja/schema/config"
import { TuiEnvSchema } from "@kaja/schema/env"
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
  location?: ServicesFile["location"] & { apiKey: string }
  telegram?: ServicesFile["telegram"] & { botToken: string }
  webSearch?: { apiKey: string }
}

/** Folds secrets.toml's credentials into services.toml's parsed sections, so no consumer needs to change. */
function mergeSecrets(parsed: ServicesFile, creds: Awaited<ReturnType<typeof secrets>>): ResolvedServices {
  return {
    ...parsed,
    location: parsed.location && creds.location ? { ...parsed.location, apiKey: creds.location.apiKey } : undefined,
    telegram: parsed.telegram && creds.telegram ? { ...parsed.telegram, botToken: creds.telegram.botToken } : undefined,
    webSearch: creds.webSearch
  }
}

/** Loads and parses services.toml, then folds in secrets.toml's credentials. Missing file: writes the commented-out template and parses that (empty). Invalid file: prints the error and exits, same policy as {@link import("./config").config}. KAJA_API_URL overrides [api].baseUrl, for pointing `kaja config fetch` at a local dev API without editing services.toml. */
export async function loadServicesFile(): Promise<ResolvedServices> {
  const servicesPath = getServicesPath()
  const f = file(servicesPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    const parsed = ServicesFileSchema.parse(TOML.parse(text))
    const kajaApiUrl = TuiEnvSchema.shape.KAJA_API_URL.safeParse(process.env.KAJA_API_URL).data
    if (kajaApiUrl) parsed.api = { ...parsed.api, baseUrl: kajaApiUrl }
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

const DEFAULT_API_BASE_URL = "https://api.kaja.io"

/** Resolves the cloud API base URL: KAJA_API_URL env → services.toml [api].baseUrl → the default cloud API. Used by both `kaja --cloud`/free-tier chat and `kaja config fetch`. */
export async function getApiBaseUrl(): Promise<string> {
  const kajaApiUrl = TuiEnvSchema.shape.KAJA_API_URL.safeParse(process.env.KAJA_API_URL).data
  if (kajaApiUrl) return kajaApiUrl
  const resolved = await services()
  return resolved.api?.baseUrl ?? DEFAULT_API_BASE_URL
}
