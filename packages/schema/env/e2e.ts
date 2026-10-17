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
  E2E_TELEGRAM_PORT: positiveInt.default(3102).describe("Port of the fake Telegram Bot API and chat window"),
  E2E_MAILDEV_URL: url.default("http://localhost:1080").describe("MailDev's web address, where sign-in codes are read"),
  E2E_STORAGE_BUCKET: trimmed.default("kaja-e2e").describe("Bucket the E2E API stores images in"),
  E2E_LLM_API_KEY: trimmed
    .optional()
    .describe("API key of a hosted model provider the cloud turns use; set, it replaces the local llama.cpp below")
    .meta({ secret: true }),
  E2E_LLM_BASE_URL: url
    .default("https://api.fireworks.ai/inference/v1")
    .describe("OpenAI-compatible base URL of the hosted provider (with E2E_LLM_API_KEY)"),
  E2E_LLM_MODEL: trimmed
    .default("accounts/fireworks/models/minimax-m3")
    .describe(
      "Model name sent to the hosted provider (with E2E_LLM_API_KEY); a cheap one, since each run makes a few calls"
    ),
  E2E_LLAMA_URL: url
    .default("http://localhost:8080")
    .describe(
      "llama.cpp server the stack's cloud turns use; one already answering there is reused, else E2E_LLAMA_MODEL starts one"
    ),
  E2E_LLAMA_BIN: trimmed
    .optional()
    .describe("llama-server binary to start when none answers at E2E_LLAMA_URL; unset, llama-server on PATH")
    .meta({ example: "/home/me/llama.cpp/build/bin/llama-server" }),
  E2E_LLAMA_MODEL: trimmed
    .optional()
    .describe("GGUF file the started llama-server loads (required when none answers at E2E_LLAMA_URL)")
    .meta({ example: "/home/me/Models/Ministral-3-3B-Reasoning-2512-Q4_K_M.gguf" }),
  E2E_LLAMA_ARGS: trimmed
    .optional()
    .describe("Extra llama-server flags (space separated), e.g. to keep it off a flaky GPU")
    .meta({ example: "-ngl 0" }),
  E2E_LLAMA_CONTEXT: positiveInt
    .default(16384)
    .describe("Context size (tokens) of the started llama-server and of the model row the API reads"),
  E2E_BROWSER: trimmed
    .optional()
    .describe("Chromium or Chrome binary to drive; unset, the first of chromium, google-chrome and chrome on PATH")
    .meta({ example: "/usr/bin/chromium" }),
  E2E_HEADED: bool.default(false).describe("Show the browser window while the scenarios run"),
  E2E_OUT_DIR: trimmed.default("e2e-out").describe("Folder (under apps/e2e) the videos and logs are written to")
})
