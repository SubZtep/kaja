import * as z from "zod"
import { bool, positiveInt, trimmed, url } from "./helpers"

export const E2eEnvSchema = z.object({
  E2E_DATABASE_URL: url
    .optional()
    .describe(
      "Postgres database the E2E stack runs on (dropped and rebuilt from the migrations every run); unset, the API's DATABASE_URL with _e2e appended to the database name"
    )
    .meta({ example: "postgresql://testuser:testpass@localhost:5433/kaja_e2e" }),
  E2E_API_PORT: positiveInt.default(3101).describe("Port the E2E API listens on, apart from bun dev's"),
  E2E_WEB_PORT: positiveInt.default(3100).describe("Port the E2E web app listens on, apart from bun dev's"),
  E2E_MAILDEV_URL: url.default("http://localhost:1080").describe("MailDev's web address, where sign-in codes are read"),
  E2E_STORAGE_BUCKET: trimmed.default("kaja-e2e").describe("Bucket the E2E API stores images in"),
  E2E_BROWSER: trimmed
    .optional()
    .describe("Chromium or Chrome binary to drive; unset, the first of chromium, google-chrome and chrome on PATH")
    .meta({ example: "/usr/bin/chromium" }),
  E2E_HEADED: bool.default(false).describe("Show the browser window while the scenarios run"),
  E2E_OUT_DIR: trimmed.default("e2e-out").describe("Folder (under apps/e2e) the videos and logs are written to")
})
