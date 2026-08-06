import { join } from "node:path"
import { type ServicesFile, ServicesFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import TEMPLATE from "../../../../docs/config/services.toml" with { type: "text" }
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
