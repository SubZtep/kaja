import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

function parseEnvFile(path: string, presetKeys: ReadonlySet<string>) {
  if (!existsSync(path)) return
  const content = readFileSync(path, "utf8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (presetKeys.has(key)) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    Bun.env[key] = value
  }
}

const apiDir = join(import.meta.dir, "..", "apps", "api")
const presetKeys = new Set(Object.keys(Bun.env))
parseEnvFile(join(apiDir, ".env.example"), presetKeys)
parseEnvFile(join(apiDir, ".env"), presetKeys)
