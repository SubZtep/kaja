import { getGeoLocation } from "@kaja/geo"
import { Bunqueue, Queue, shutdownManager, Worker } from "bunqueue/client"
import { logger } from "./logger"

interface GeoIPJob {
  nodeId: string
  ip: string
}

export const geoipQueue = new Bunqueue<GeoIPJob>("geoips", {
  embedded: true,
  processor: async job => {
    logger.info({ job }, "Processing GeoIP job")
    await job.updateProgress(100)
    return { sent: true }
  }
})

const worker = new Worker<GeoIPJob>(
  "geoips",
  async job => {
    logger.info({ job: job.data }, "Processing IP")
    const location = getGeoLocation(job.data.ip)
    logger.info({ job: job.data, location }, "GeoIP result")
    await job.updateProgress(100)
    return { sent: true }
  },
  { embedded: true }
)

worker.on("completed", job => {
  logger.info({ job }, "GeoIP job completed")
})

// Graceful shutdown
process.on("SIGINT", async () => {
  await worker.close()
  shutdownManager()
})
