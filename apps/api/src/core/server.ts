import { error, info } from "@kaja/logger"
import { app } from "../app"
import { createTelegramBotService } from "../features/telegram"
import { CronService } from "./cron"
import { env } from "./env"

const port = env.PORT
info("API is running", { port })

// Start cron jobs
const cron = new CronService()
cron.start()

// Start the always-on cloud Telegram bot, if configured
createTelegramBotService()
  ?.start()
  .catch(err => error("Telegram bot failed to start", { error: String(err) }))

export default {
  port,
  fetch: app.fetch,
  // SSE connections need longer timeout (max 255 seconds ~4 minutes)
  idleTimeout: 255
}
