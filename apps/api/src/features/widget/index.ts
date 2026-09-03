import { resolve } from "node:path"
import { error as logError } from "@kaja/logger"
import { WidgetTurnRequestSchema } from "@kaja/schema/nasi"
import { Hono } from "hono"
import { withLock } from "../../core/lock"
import { widgetKeyRateLimiter, widgetTurnRateLimiter } from "../../core/rate-limit"
import { badGateway, badRequest, notFound } from "../../types/errors"
import { type WidgetVariables, widgetKeyAuthMiddleware } from "./auth"
import { runWidgetTurn } from "./chat"
import { widgetCors } from "./cors"

export const widgetRoutes = new Hono<{ Variables: WidgetVariables }>()
widgetRoutes.use("*", widgetCors)

// Built by `bun run --filter @kaja/widget build`; copied to apps/api/public/widget.js (see Dockerfile) —
// not resolved via import.meta.dir since that points at server.js's own location once bundled, not this source file's.
const widgetBundlePath = resolve(process.env.WIDGET_BUNDLE_PATH?.trim() || "public/widget.js")

widgetRoutes.get("/widget.js", async c => {
  const file = Bun.file(widgetBundlePath)
  if (!(await file.exists())) return notFound(c, "Widget bundle not built")
  return new Response(file, { headers: { "content-type": "application/javascript; charset=utf-8" } })
})

widgetRoutes.options("/turn", c => c.body(null, 204))

widgetRoutes.post("/turn", widgetKeyRateLimiter, widgetTurnRateLimiter, widgetKeyAuthMiddleware, async c => {
  const widgetKey = c.get("widgetKey")
  const parsed = WidgetTurnRequestSchema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return badRequest(c, "Invalid request body")

  try {
    const result = await withLock(`${widgetKey.id}:${parsed.data.visitorId}`, () =>
      runWidgetTurn(widgetKey, parsed.data)
    )
    return c.json(result)
  } catch (error) {
    if (error instanceof Error && error.name === "NasiSessionNotFound") return notFound(c, "Session not found")
    if (error instanceof Error && error.message === "no_model") return notFound(c, "No model available")
    if (error instanceof Error && error.name === "NasiModelUnavailable") return badGateway(c, error.message)
    logError("widget turn failed", { widgetKeyId: widgetKey.id, error: String(error) })
    throw error
  }
})
