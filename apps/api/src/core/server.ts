import { setWarnHandler } from "@kaja/nasi"
import { app } from "../app"
import { createTelegramBotService } from "../features/telegram"
import { marketplaceService } from "../services"
import { CronService } from "./cron"
import { env } from "./env"
import { reportError } from "./report"

const port = env.PORT

// The agent brain reports skipped abilities, missing keys and failed MCP connections here.
setWarnHandler((message, payload) => console.warn(message, payload))

// Start cron jobs
const cron = new CronService()
cron.start()

// Sync the ability catalog once at startup without holding up the server; failures are logged and recorded in its status.
marketplaceService.sync().catch(() => {})

if (!env.USER_SECRET_KEY) {
  console.warn("USER_SECRET_KEY isn't set: users can't save ability keys, and tools that need one are hidden")
}

// Start the always-on cloud Telegram bot, if configured
const telegramBot = createTelegramBotService()
telegramBot?.start().catch(err => reportError("Telegram bot failed to start", err))

// Release Telegram long polling on shutdown so the next deploy's instance doesn't hit a getUpdates conflict
if (telegramBot) {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      telegramBot
        .stop()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
  }
}

export default {
  port,
  fetch: app.fetch,
  // SSE connections need longer timeout (max 255 seconds ~4 minutes)
  idleTimeout: 255
}
