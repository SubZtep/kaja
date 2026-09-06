import { bool, positiveInt, trimmed, url } from "@kaja/schema/env"
import * as z from "zod"

export const EnvSchema = z.object({
  NODE_ENV: trimmed
    .optional()
    .describe('Node environment; "development" enables API docs and Better Auth\'s OpenAPI plugin'),
  PORT: positiveInt.default(3001).describe("Port the API server listens on"),
  CORS_ORIGIN: url.describe(
    "Origin allowed for browser requests (also Better Auth's trusted origin and email callback base)"
  ),
  DATABASE_URL: url.describe("PostgreSQL connection string"),
  BETTER_AUTH_SECRET: trimmed.describe("Better Auth signing secret").meta({ secret: true, section: "Security" }),
  BETTER_AUTH_URL: url.optional().describe("Public base URL of this API, used by Better Auth"),
  WEB_PUBLIC_URL: url
    .optional()
    .describe("Public web app URL; falls back to CORS_ORIGIN for the device authorization verification link"),
  CROSS_PARENT_DOMAIN: trimmed
    .optional()
    .describe("Set when API and web share a parent domain (e.g. ondis.co) to enable cross-subdomain cookies"),

  SMTP_HOST: trimmed.optional().describe("SMTP server hostname"),
  SMTP_PORT: positiveInt.optional().describe("SMTP server port").meta({ example: "1025" }),
  SMTP_SECURE: bool.optional().describe("Use TLS for the SMTP connection"),
  SMTP_USER: trimmed.optional().describe("SMTP auth username"),
  SMTP_PASS: trimmed.optional().describe("SMTP auth password").meta({ secret: true }),
  CI: trimmed.optional().describe("Set by the CI runner; skips SMTP verification on boot when present"),

  CONFIG_API_TOKEN: trimmed
    .optional()
    .describe("Shared-secret bearer token for /config/* — fail-closed: missing/empty denies all config routes")
    .meta({ secret: true, example: "kaja", section: "Config API" }),

  BUN_TEST: trimmed.optional().describe("Set by the Bun test runner; disables rate limiting when present"),
  RATE_LIMIT_ENABLED: bool
    .optional()
    .describe("Set false to disable global + auth + nasi/widget turn rate limiters")
    .meta({ section: "Rate Limiting" }),
  RATE_LIMIT_WINDOW_MS: positiveInt
    .default(15 * 60 * 1000)
    .describe("Global rate limit window (ms)")
    .meta({ section: "Rate Limiting" }),
  RATE_LIMIT_MAX: positiveInt
    .default(1000)
    .describe("Max requests per window per IP")
    .meta({ section: "Rate Limiting" }),
  AUTH_RATE_LIMIT_WINDOW_MS: positiveInt
    .default(15 * 60 * 1000)
    .describe("Auth rate limit window (ms)")
    .meta({ section: "Rate Limiting" }),
  AUTH_RATE_LIMIT_MAX: positiveInt
    .default(2000)
    .describe("Max auth requests per window per IP")
    .meta({ section: "Rate Limiting" }),
  NASI_TURN_RATE_LIMIT_WINDOW_MS: positiveInt
    .default(10 * 60 * 1000)
    .describe("/nasi/turn(/stream) rate limit window (ms)")
    .meta({ section: "Rate Limiting" }),
  NASI_TURN_RATE_LIMIT_MAX: positiveInt
    .default(1000)
    .describe("Max turns per window per user")
    .meta({ section: "Rate Limiting" }),
  WIDGET_TURN_RATE_LIMIT_WINDOW_MS: positiveInt
    .default(10 * 60 * 1000)
    .describe("/widget/turn rate limit window (ms)")
    .meta({ section: "Rate Limiting" }),
  WIDGET_TURN_RATE_LIMIT_MAX: positiveInt
    .default(300)
    .describe("Max turns per window per (widget key, IP) pair")
    .meta({ section: "Rate Limiting" }),
  WIDGET_KEY_RATE_LIMIT_WINDOW_MS: positiveInt
    .default(10 * 60 * 1000)
    .describe("/widget/turn spend-ceiling window (ms)")
    .meta({ section: "Rate Limiting" }),
  WIDGET_KEY_RATE_LIMIT_MAX: positiveInt
    .default(3000)
    .describe("Max turns per window per widget key, regardless of visitor/IP")
    .meta({ section: "Rate Limiting" }),

  NASI_DATA_DIR: trimmed
    .default("/var/lib/kaja/nasi")
    .describe("Per-user Nasi SQLite directory (one <userId>/nasi.sqlite file each)"),
  NASI_STUB_MODEL: trimmed
    .optional()
    .describe("When set, /nasi turns use a stub model instead of resolving a real provider (test/dev only)"),

  WIDGET_BUNDLE_PATH: trimmed
    .default("public/widget.js")
    .describe("Path to the built embeddable widget bundle, served at GET /widget/widget.js")
})
