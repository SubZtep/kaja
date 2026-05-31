import { getGeoLocation } from "@kaja/geo"
import { error, info, trace, warn } from "@kaja/logger"
import PQueue from "p-queue"
import { nodeService } from "../features/kaja"

interface GeoIPJob {
  nodeId: string
  ip: string
}

const queue = new PQueue({ concurrency: 2 })

export const geoipQueue = {
  async add(data: GeoIPJob) {
    trace("Adding GeoIP job to queue", { data })

    await queue.add(async () => {
      try {
        info("Starting GeoIP lookup", { nodeId: data.nodeId, ip: data.ip })
        const location = await getGeoLocation(data.ip)
        info("Got location data", { nodeId: data.nodeId, location })

        if (location) {
          info("Calling nodeService.updateGeoLocation", { nodeId: data.nodeId })
          const result = await nodeService.updateGeoLocation(data.nodeId, location)
          info("Database update result", { nodeId: data.nodeId, result })
        } else {
          warn("No location data returned - GeoIP database may be missing", { nodeId: data.nodeId, ip: data.ip })
        }

        info("GeoIP job completed", { nodeId: data.nodeId, location })
      } catch (err) {
        error("GeoIP job failed", { error: err, nodeId: data.nodeId })
        throw err
      }
    })
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  info("Waiting for GeoIP queue to finish...")
  await queue.onIdle()
  process.exit(0)
})
