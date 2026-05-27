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
    logger.trace({ data }, "Adding GeoIP job to queue")

    await queue.add(async () => {
      try {
        logger.info({ nodeId: data.nodeId, ip: data.ip }, "Starting GeoIP lookup")
        const location = getGeoLocation(data.ip)
        logger.info({ nodeId: data.nodeId, location }, "Got location data")

        if (location) {
          logger.info({ nodeId: data.nodeId }, "Calling nodeService.updateGeoLocation")
          const result = await nodeService.updateGeoLocation(data.nodeId, location)
          logger.info({ nodeId: data.nodeId, result }, "Database update result")
        } else {
          logger.warn({ nodeId: data.nodeId, ip: data.ip }, "No location data returned - GeoIP database may be missing")
        }

        logger.info({ nodeId: data.nodeId, location }, "GeoIP job completed")
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
