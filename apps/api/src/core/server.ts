import { info } from "@kaja/logger"
import { app } from "../app"
import { SchedulerService } from "../features/kaja/services/scheduler"
import { CronService } from "./cron"
import { db } from "./db"

const port = Number(process.env.PORT ?? 3001)
info("API is running", { port })

// Start the scheduler for inactive nodes
const scheduler = new SchedulerService(db)
scheduler.start()

// Start cron jobs
const cron = new CronService()
cron.start()

export default {
  port,
  fetch: app.fetch,
  // SSE connections need longer timeout (max 255 seconds ~4 minutes)
  idleTimeout: 255
}
