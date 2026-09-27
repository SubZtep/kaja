import * as z from "zod"
import { bool, positiveInt, trimmed, url } from "./helpers"

export const SandboxEnvSchema = z.object({
  NODE_ENV: trimmed.optional().describe('Node environment; "production" turns on Sentry'),
  KAJA_API_URL: url
    .optional()
    .describe(
      "Kaja API the sandbox connects out to (a WebSocket at /sandbox/connect; nothing connects in); unset, https://api.kaja.io with NODE_ENV=production (the image), else http://localhost:3001"
    )
    .meta({ example: "http://localhost:3001" }),
  KAJA_SANDBOX_KEY: trimmed
    .optional()
    .describe(
      "Your sandbox key from the web app's Sandbox page, linking the sandbox to your account; unset, it runs anonymously for everyone"
    )
    .meta({ secret: true }),
  SANDBOX_NAME: trimmed.max(80).optional().describe("A name shown for this sandbox"),
  SANDBOX_STATE_DIR: trimmed
    .default("./.sandbox")
    .describe(
      "Folder the sandbox keeps its registration in, so a restart comes back as the same sandbox (mount a volume there in Docker)"
    )
    .meta({ example: "/data" }),
  MARKETPLACE_DIR: trimmed
    .default("../../marketplace")
    .describe("Folder whose mcp/*.toml stdio manifests are the only servers the sandbox runs"),
  SANDBOX_OVERRIDES: trimmed
    .optional()
    .describe(
      "JSON file replacing a manifest's command/args for this host, e.g. a preinstalled binary and Chrome flags"
    )
    .meta({ example: "overrides.json" }),
  SANDBOX_CACHE_DIR: trimmed
    .optional()
    .describe(
      "Folder the servers share for bun, uv and npm caches (and uv's Pythons), so a package bunx/uvx fetched stays fetched; unset, each start refetches into its throwaway HOME"
    )
    .meta({ example: "/home/node/.cache/mcp" }),
  SANDBOX_IDLE_MS: positiveInt
    .default(10 * 60 * 1000)
    .describe("How long an unused server process is kept warm before it's stopped (ms)"),
  SANDBOX_MAX_PROCESSES: positiveInt
    .optional()
    .describe(
      "Most server processes running at once, over all users; unset, one per 512 MB of the container's memory limit (else the machine's RAM), less 512 MB for the sandbox itself"
    )
    .meta({ example: "8" }),
  SANDBOX_SERVER_MEMORY: positiveInt
    .default(1024 * 1024 * 1024)
    .describe("Bytes of memory one server (a browser with all its processes) may use before it's stopped"),
  SANDBOX_ISOLATE_USERS: bool
    .default(true)
    .describe(
      "Run each user's servers as their own Linux user (needs the sandbox to run as root, as in the image), so users can't read each other's files"
    ),
  SANDBOX_EGRESS_PORT: positiveInt
    .default(3128)
    .describe("Port of the 127.0.0.1 proxy that keeps the browsers to public addresses; must match overrides.json"),
  WEB_PROXY: trimmed
    .refine(value => value.startsWith("http://"), "must be an http:// proxy URL")
    .optional()
    .describe(
      "HTTP proxy the browsers' checked traffic goes out through (CONNECT to the checked IP, any port); unset connects directly"
    )
    .meta({ secret: true, example: "http://user:pass@proxy.example.com:8080" })
})
