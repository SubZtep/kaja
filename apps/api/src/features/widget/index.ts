import { resolve } from "node:path"
import { error as logError } from "@kaja/logger"
import { categorizeError } from "@kaja/nasi"
import { WidgetTurnRequestSchema } from "@kaja/schema/nasi"
import { Hono } from "hono"
import { withLock } from "../../core/lock"
import { widgetKeyRateLimiter, widgetTurnRateLimiter } from "../../core/rate-limit"
import { widgetService } from "../../services"
import { badGateway, badRequest, internalError, notFound } from "../../types/errors"
import { type WidgetVariables, widgetKeyAuthMiddleware } from "./auth"
import { runWidgetTurn } from "./chat"
import { widgetCors } from "./cors"

export const widgetRoutes = new Hono<{ Variables: WidgetVariables }>()
widgetRoutes.use("*", widgetCors)

// In prod `bun run --filter @kaja/api build` bundles widgets/src/index.ts into public/widget.js ahead
// of time, so it's served as a plain static file (no bundler, no node_modules needed at runtime) — cwd
// is /home/bun/app there (matches the Dockerfile WORKDIR), same as public/. In dev the file is usually
// missing (only `bun run --filter @kaja/api build:widget` writes it) — fall back to bundling it fresh on
// every request, uncached, so widget source edits show up without a restart; import.meta.dir (this
// file's own dir) anchors that fallback since it only ever runs unbundled, where cwd may vary but
// import.meta.dir is always apps/api/src/features/widget.
const widgetBundlePath = resolve("public/widget.js")
const widgetEntrypoint = resolve(import.meta.dir, "../../../widgets/src/index.ts")

async function getWidgetBundle(): Promise<string> {
  const file = Bun.file(widgetBundlePath)
  if (await file.exists()) return file.text()

  const result = await Bun.build({
    entrypoints: [widgetEntrypoint],
    target: "browser",
    format: "iife",
    minify: true
  })
  const output = result.outputs[0]
  if (!result.success || !output) throw new AggregateError(result.logs, "Widget bundle build failed")
  return output.text()
}

// Plain string literal (not String.raw) so Hono can infer the ":rawKey" param name from the
// literal type — a tagged template widens to `string` and c.req.param("rawKey") loses its typing.
widgetRoutes.get("/:rawKey{[A-Za-z0-9_-]+\\.js}", widgetKeyRateLimiter, async c => {
  const rawKey = c.req.param("rawKey").replace(/\.js$/, "")
  const resolved = await widgetService.resolveByRawKey(rawKey)
  if (!resolved) return notFound(c, "Unknown widget")

  const bundle = await getWidgetBundle()
  const body = `window.__kajaWidgetMode=${JSON.stringify(resolved.config.widgetType)};\n${bundle}`
  return new Response(body, { headers: { "content-type": "application/javascript; charset=utf-8" } })
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
    const { category, message } = categorizeError(error)
    logError("widget turn failed", { widgetKeyId: widgetKey.id, category, error: String(error) })
    return internalError(c, message)
  }
})
