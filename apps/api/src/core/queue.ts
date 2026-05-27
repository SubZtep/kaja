import { getGeoLocation } from "@kaja/geo"
import { Queue, shutdownManager, Worker } from "bunqueue/client"
import { nodeService } from "#/features/kaja"
import { logger } from "./logger"

interface GeoIPJob {
  nodeId: string
  ip: string
}

export const geoipQueue = new Queue<GeoIPJob>("geoips", {
  embedded: true
})

const worker = new Worker<GeoIPJob>(
  "geoips",
  async job => {
    const location = getGeoLocation(job.data.ip)
    await job.updateProgress(50)
    logger.trace({ nodeId: job.data.nodeId, location }, "GeoIP result")
    await nodeService.updateGeoLocation(job.data.nodeId, location)
    await job.updateProgress(100)
    return { sent: true }
  },
  { embedded: true }
)

worker.on("completed", job => {
  logger.info({ job }, "GeoIP job completed")
})

process.on("SIGINT", async () => {
  await worker.close()
  shutdownManager()
})
