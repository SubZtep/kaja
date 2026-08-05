import { join } from "node:path"
import { tomlString } from "@kaja/shared"
import { file, TOML, write } from "bun"
import TEMPLATE from "../../../../docs/config/services.toml" with { type: "text" }
import { type ServicesFile, ServicesFileSchema } from "../../schemas/services"
import { t } from "../i18n"
import { getConfigDir } from "./config"

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

/**
 * Load and parse services.toml. Missing file: writes the commented-out
 * template and parses that (empty). Invalid file: prints the error and
 * exits, same policy as {@link import("./config").config}.
 */
export async function loadServicesFile(): Promise<ServicesFile> {
  const servicesPath = getServicesPath()
  const f = file(servicesPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written
  // BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    return ServicesFileSchema.parse(TOML.parse(text))
  } catch (error: any) {
    console.log(t("services.invalidAt", { path: servicesPath, message: error.message }))
    process.exit(1)
  }
}

// Cached after the first read: mirrors lib/config.ts's config() cache so
// per-utterance readers (stt/tts/geo) don't hit disk each time.
let cached: ServicesFile | undefined

/** Clears the services() cache after a write made outside this module. */
export function invalidateServicesCache() {
  cached = undefined
}

export async function services(): Promise<ServicesFile> {
  if (cached) return cached
  cached = await loadServicesFile()
  return cached
}

// export function tomlString(s: string) {
//   return String.raw`"${s.replaceAll('"', '\\"')}"`
// }

/** Renders a ServicesFile back to TOML text — flat sections, no arrays except allowedUserIds. */
function renderServicesToml(data: ServicesFile) {
  const sections: string[] = []
  if (data.api) {
    const lines = [`[api]`, `baseUrl = ${tomlString(data.api.baseUrl)}`]
    if (data.api.token) lines.push(`token = ${tomlString(data.api.token)}`)
    sections.push(lines.join("\n"))
  }
  if (data.location)
    sections.push(
      `[location]\nserviceUrl = ${tomlString(data.location.serviceUrl)}\napiKey = ${tomlString(data.location.apiKey)}`
    )
  if (data.webSearch) sections.push(`[webSearch]\napiKey = ${tomlString(data.webSearch.apiKey)}`)
  if (data.telegram)
    sections.push(
      `[telegram]\nbotToken = ${tomlString(data.telegram.botToken)}\nallowedUserIds = [${data.telegram.allowedUserIds.join(", ")}]`
    )
  return sections.join("\n\n")
}

/**
 * Merges fields into services.toml without requiring the rest of the file
 * to be schema-valid first — used by `kaja config fetch --api-url`, which
 * must work even before services.toml exists. Only api.baseUrl is written
 * back today; other sections are hand-edited only.
 */
export async function saveFetchedApiBaseUrl(baseUrl: string) {
  const current = await readServicesLoose()
  const merged: ServicesFile = { ...current, api: { ...current.api, baseUrl } }
  const f = file(getServicesPath())
  await write(f, renderServicesToml(merged))
  cached = undefined
}
