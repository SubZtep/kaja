import { info } from "@kaja/logger"
import { app } from "../app"
import { CronService } from "./cron"
import { env } from "./env"

const port = env.PORT
info("API is running", { port })

// Start cron jobs
const cron = new CronService()
cron.start()

export default {
  port,
  fetch: app.fetch,
  // SSE connections need longer timeout (max 255 seconds ~4 minutes)
  idleTimeout: 255
}
