import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { pool } from "../../core/db"
import { storageReachable } from "../../core/files"
import type { RouteVariables } from "../../types"

export const healthRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()

/** How long each dependency gets to answer before it counts as down. */
const PROBE_TIMEOUT_MS = 3000

const healthRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "API health check",
  description: "The process is up; checks nothing else (see /health/ready).",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().openapi({ example: "ok" })
          })
        }
      }
    }
  }
})

healthRoutes.openapi(healthRoute, c => {
  return c.json({ status: "ok" })
})

const probeState = z.enum(["ok", "error"])
const readySchema = z.object({
  status: z.enum(["ok", "degraded", "down"]).openapi({ example: "ok" }),
  database: probeState,
  storage: probeState
})

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["System"],
  summary: "API readiness check",
  description:
    "Probes the database and object storage. Without the database nothing works (503); without storage only images do, so it's `degraded` but still 200. The Docker HEALTHCHECK polls this.",
  responses: {
    200: { description: "Ready (storage may be degraded)", content: { "application/json": { schema: readySchema } } },
    503: { description: "The database is unreachable", content: { "application/json": { schema: readySchema } } }
  }
})

const probeResult = (ok: boolean): z.infer<typeof probeState> => (ok ? "ok" : "error")

healthRoutes.openapi(readyRoute, async c => {
  const [databaseOk, storageOk] = await Promise.all([databaseReachable(), storageReachable(PROBE_TIMEOUT_MS)])
  const probes = { database: probeResult(databaseOk), storage: probeResult(storageOk) }
  if (!databaseOk) return c.json({ status: "down" as const, ...probes }, 503)
  return c.json({ status: storageOk ? ("ok" as const) : ("degraded" as const), ...probes }, 200)
})

// SELECT 1 within the probe timeout (the pool's own connect timeout is shorter; this also bounds a busy pool's queue)
async function databaseReachable(): Promise<boolean> {
  const timeout = new Promise<false>(resolve => setTimeout(resolve, PROBE_TIMEOUT_MS, false))
  const query = pool.query("SELECT 1").then(
    () => true,
    () => false
  )
  return Promise.race([query, timeout])
}
