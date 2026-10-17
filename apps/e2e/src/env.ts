import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { E2eEnvSchema, parseEnv } from "@kaja/schema/env"

export const e2eDir = join(import.meta.dir, "..")
export const apiDir = join(e2eDir, "..", "api")
export const webDir = join(e2eDir, "..", "web")

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const values: Record<string, string> = {}
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    let value = trimmed.slice(eq + 1)
    const hash = value.indexOf("#")
    if (hash !== -1) value = value.slice(0, hash)
    value = value.trim()
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1)
    values[trimmed.slice(0, eq).trim()] = value
  }
  return values
}

/** The API's own env (example, then .env, then the shell), which the E2E stack starts from and overrides. */
export const apiEnv: Record<string, string | undefined> = {
  ...readEnvFile(join(apiDir, ".env.example")),
  ...readEnvFile(join(apiDir, ".env")),
  ...process.env
}

const parsed = parseEnv(E2eEnvSchema, { ...readEnvFile(join(e2eDir, ".env")), ...process.env })
if (!parsed.success) {
  console.error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"))
  process.exit(1)
}

export const e2eEnv = parsed.data

function withDatabase(url: string, name: string): string {
  const parsedUrl = new URL(url)
  parsedUrl.pathname = `/${name}`
  return parsedUrl.toString()
}

/** The database the stack runs on: always a separate one, so a run never touches the dev data. */
export function databaseUrl(): string {
  if (e2eEnv.E2E_DATABASE_URL) return e2eEnv.E2E_DATABASE_URL
  const dev = apiEnv.DATABASE_URL
  if (!dev) throw new Error("DATABASE_URL isn't set in apps/api/.env; set E2E_DATABASE_URL")
  return withDatabase(dev, `${new URL(dev).pathname.slice(1)}_e2e`)
}

export { withDatabase }
