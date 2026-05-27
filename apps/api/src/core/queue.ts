import { getGeoLocation } from "@kaja/geo"
import PQueue from "p-queue"
import { nodeService } from "#/features/kaja"
import { logger } from "./logger"

interface GeoIPJob {
  nodeId: string
  ip: string
}

const queue = new PQueue({ concurrency: 2 })

export const geoipQueue = {
  async add(data: GeoIPJob) {
    logger.info({ data }, "Adding GeoIP job to queue")

    await queue.add(async () => {
      try {
        logger.trace({ nodeId: data.nodeId, ip: data.ip }, "Processing GeoIP job")
        const location = getGeoLocation(data.ip)
        logger.trace({ nodeId: data.nodeId, location }, "GeoIP result")

        await nodeService.updateGeoLocation(data.nodeId, location)

        logger.info({ nodeId: data.nodeId }, "GeoIP job completed")
      } catch (error) {
        logger.error({ error, nodeId: data.nodeId }, "GeoIP job failed")
        throw error
      }
    })
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Waiting for GeoIP queue to finish...")
  await queue.onIdle()
  process.exit(0)
})
