import { mkdirSync, openSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"
import { applyMigrations, readMigrations } from "../../api/scripts/migrations"
import { seedConfig } from "../../api/scripts/seed-config"
import { apiDir, databaseUrl, e2eDir, e2eEnv, webDir, withDatabase } from "./env"

export type Stack = {
  apiUrl: string
  webUrl: string
  databaseUrl: string
  stop(): Promise<void>
}

/** Drops and rebuilds the E2E database from the migrations and the config seed, as a deploy would. */
async function buildDatabase(url: string): Promise<void> {
  const name = new URL(url).pathname.slice(1)
  const quoted = `"${name.replaceAll('"', '""')}"`
  const admin = new Client({ connectionString: withDatabase(url, "postgres") })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${quoted}`)
  } finally {
    await admin.end()
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await applyMigrations(client, readMigrations(join(apiDir, "migrations")), { log: () => {} })
    await seedConfig(client)
  } finally {
    await client.end()
  }
}

function start(name: string, cmd: string[], cwd: string, env: Record<string, string>, logDir: string): Bun.Subprocess {
  const log = openSync(join(logDir, `${name}.log`), "w")
  return Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: log, stderr: log })
}

async function waitFor(url: string, name: string, process: Bun.Subprocess, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`${name} exited with ${process.exitCode} before it was ready`)
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Not listening yet
    }
    await Bun.sleep(300)
  }
  throw new Error(`${name} wasn't ready at ${url} within ${timeoutMs / 1000} s`)
}

/** Starts the isolated stack: a fresh database, the API and the web dev server, each logging to the output folder. */
export async function startStack(): Promise<Stack> {
  const logDir = join(e2eDir, e2eEnv.E2E_OUT_DIR, "logs")
  mkdirSync(logDir, { recursive: true })

  const dbUrl = databaseUrl()
  await buildDatabase(dbUrl)

  const apiUrl = `http://localhost:${e2eEnv.E2E_API_PORT}`
  const webUrl = `http://localhost:${e2eEnv.E2E_WEB_PORT}`

  // Empty values switch a dev setting off: the env parser drops them, and they win over apps/api/.env
  const api = start(
    "api",
    ["bun", "run", "src/core/server.ts"],
    apiDir,
    {
      PORT: String(e2eEnv.E2E_API_PORT),
      DATABASE_URL: dbUrl,
      CORS_ORIGIN: webUrl,
      BETTER_AUTH_URL: apiUrl,
      WEB_PUBLIC_URL: webUrl,
      CROSS_PARENT_DOMAIN: "",
      SSR_SECRET: "",
      STORAGE_BUCKET: e2eEnv.E2E_STORAGE_BUCKET,
      RATE_LIMIT_ENABLED: "false",
      TURNSTILE_SECRET: "",
      // The dev bot's token would make this API poll the real Telegram
      TELEGRAM_BOT_TOKEN: "",
      SANDBOX_URL: ""
    },
    logDir
  )
  const web = start(
    "web",
    ["bunx", "vite", "dev", "--port", String(e2eEnv.E2E_WEB_PORT), "--strictPort"],
    webDir,
    {
      VITE_API_URL: apiUrl,
      VITE_APP_URL: webUrl,
      API_URL: apiUrl,
      SSR_SECRET: "",
      VITE_TURNSTILE_SITE_KEY: ""
    },
    logDir
  )

  const stop = async () => {
    for (const child of [web, api]) child.kill()
    await Promise.all([web.exited, api.exited])
  }

  try {
    await Promise.all([waitFor(`${apiUrl}/health`, "api", api), waitFor(webUrl, "web", web)])
  } catch (error) {
    await stop()
    throw new Error(`${(error as Error).message} (logs in ${logDir})`)
  }
  return { apiUrl, webUrl, databaseUrl: dbUrl, stop }
}
