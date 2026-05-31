import { app } from "../app"
import { SchedulerService } from "../features/kaja/services/scheduler"
import { db } from "./db"
import { logger } from "./logger"

const port = Number(process.env.PORT ?? 3001)
logger.info({ port }, "API is running")

// Start the scheduler for inactive nodes
const scheduler = new SchedulerService(db)
scheduler.start()

export default {
  port,
  fetch: app.fetch
}
