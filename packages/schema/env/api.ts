import * as z from "zod"
import { bool, positiveInt, trimmed, url } from "./helpers"

export const ApiEnvSchema = z.object({
  NODE_ENV: trimmed
    .optional()
    .describe('Node environment; "development" enables API docs and Better Auth\'s OpenAPI plugin'),
  PORT: positiveInt.default(3001).describe("Port the API server listens on"),
  CORS_ORIGIN: url.describe(
    "Origin allowed for browser requests (also Better Auth's trusted origin and email callback base)"
  ),
  DATABASE_URL: url.describe("PostgreSQL connection string"),
  BETTER_AUTH_SECRET: trimmed.describe("Better Auth signing secret").meta({ secret: true, section: "Security" }),
  SSR_SECRET: trimmed
    .optional()
    .describe(
      "Shared with the web's SSR_SECRET; the web's server-side calls send it with the visitor's IP so rate limits key on the visitor, not the web host"
    )
    .meta({ secret: true, section: "Security" }),
  BETTER_AUTH_URL: url.optional().describe("Public base URL of this API, used by Better Auth"),
  WEB_PUBLIC_URL: url
    .optional()
    .describe("Public web app URL; falls back to CORS_ORIGIN for the device authorization verification link"),
  CROSS_PARENT_DOMAIN: trimmed
    .optional()
    .describe("Set when API and web share a parent domain (e.g. ondis.co) to enable cross-subdomain cookies"),

  GOOGLE_CLIENT_ID: trimmed
    .optional()
    .describe("Google OAuth client id; Google sign-in is enabled when both id and secret are set")
    .meta({ section: "Google Sign-in" }),
  GOOGLE_CLIENT_SECRET: trimmed
    .optional()
    .describe("Google OAuth client secret (redirect URI: <BETTER_AUTH_URL>/auth/callback/google)")
    .meta({ secret: true, section: "Google Sign-in" }),

  SMTP_HOST: trimmed.optional().describe("SMTP server hostname"),
  SMTP_PORT: positiveInt.optional().describe("SMTP server port").meta({ example: "1025" }),
  SMTP_SECURE: bool.optional().describe("Use TLS for the SMTP connection"),
  SMTP_USER: trimmed.optional().describe("SMTP auth username"),
  SMTP_PASS: trimmed.optional().describe("SMTP auth password").meta({ secret: true }),
  CI: trimmed.optional().describe("Set by the CI runner; skips SMTP verification on boot when present"),

  CONFIG_API_TOKEN: trimmed
    .optional()
    .describe("Shared-secret bearer token for /config/* — fail-closed: missing/empty denies all config routes")
    .meta({ example: "kaja", devDefault: true, section: "Config API" }),

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

  NASI_STUB_MODEL: trimmed
    .optional()
    .describe("When set, /nasi turns use a stub model instead of resolving a real provider (test/dev only)"),

  WEB_PROXY: trimmed
    .optional()
    .describe("HTTP(S) proxy for cloud fetch_url egress; unset leaves fetch_url out of cloud turns entirely")
    .meta({ secret: true, example: "http://user:pass@proxy.example.com:8080" }),

  // TODO: temporary until admin-managed service keys (like providers) replace it.
  ABILITY_KEYS: trimmed
    .optional()
    .describe(
      "Server-wide ability API keys as comma-separated name=key pairs (e.g. brave-search=BSA...), shared by every cloud user; an ability that needs a key and has none here isn't offered in the cloud"
    )
    .meta({ secret: true, section: "Marketplace" }),

  MARKETPLACE_REPO: trimmed
    .default("SubZtep/kaja")
    .describe("GitHub owner/repo whose marketplace/ folder the cloud ability catalog is synced from")
    .meta({ section: "Marketplace" }),
  MARKETPLACE_REF: trimmed
    .default("main")
    .describe("Branch (or tag) of MARKETPLACE_REPO to sync")
    .meta({ section: "Marketplace" }),

  TELEGRAM_BOT_TOKEN: trimmed
    .optional()
    .describe("BotFather token; when set, starts the always-on cloud Telegram bot")
    .meta({ secret: true, section: "Telegram" })
})
