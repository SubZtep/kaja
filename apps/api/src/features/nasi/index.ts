import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { error as logError } from "@kaja/logger"
import { deleteSessionRow, listSessions, loadSessionRow, withStorePath } from "@kaja/nasi"
import { NasiTurnRequestSchema, NasiTurnResponseSchema } from "@kaja/schema/nasi"
import { streamSSE } from "hono/streaming"
import { nasiTurnRateLimiter } from "../../core/rate-limit"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth/middleware"
import { openUserTurnStream, runUserTurn } from "./chat"
import { withUserLock } from "./mutex"
import { userSqlitePath } from "./paths"

const HEARTBEAT_INTERVAL_MS = 15_000

export const nasiRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
nasiRoutes.use("*", requireAuthMiddleware)
nasiRoutes.use("/turn", nasiTurnRateLimiter)
nasiRoutes.use("/turn/stream", nasiTurnRateLimiter)

const errorSchema = z.object({ error: z.string() })

const turnRoute = createRoute({
  method: "post",
  path: "/turn",
  tags: ["Nasi"],
  summary: "Run one agent turn",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: NasiTurnRequestSchema } }, required: true }
  },
  responses: {
    200: { description: "Turn complete", content: { "application/json": { schema: NasiTurnResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Session not found", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(turnRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const body = c.req.valid("json")
  try {
    const result = await withUserLock(user.id, () => runUserTurn(user.id, body))
    return c.json(result)
  } catch (error) {
    if (error instanceof Error && error.name === "NasiSessionNotFound") return notFound(c, "Session not found")
    if (error instanceof Error && error.message === "no_model") return notFound(c, "No model available")
    throw error
  }
})

/** SSE event name for each AgentEvent type the client should see; events with no entry (tool_image, display_image) are not forwarded. */
const SSE_EVENT_NAME: Partial<Record<string, string>> = {
  delta: "delta",
  reasoning: "reasoning",
  message: "message",
  tool_call: "tool_call",
  ask_user: "ask_user",
  persona_switch: "persona_switch",
  usage: "usage",
  final: "final"
}

nasiRoutes.post("/turn/stream", async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const parsed = NasiTurnRequestSchema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return badRequest(c, "Invalid request body")
  const body = parsed.data

  return streamSSE(c, async stream => {
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)
    stream.onAbort(() => clearInterval(heartbeat))

    try {
      await withUserLock(user.id, async () => {
        const gen = await openUserTurnStream(user.id, body)
        let next = await gen.next()
        while (!next.done) {
          const name = SSE_EVENT_NAME[next.value.type]
          if (name) await stream.writeSSE({ event: name, data: JSON.stringify(next.value) })
          next = await gen.next()
        }
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ session: next.value.session, status: next.value.status })
        })
      })
    } catch (error) {
      const isNotFound = error instanceof Error && error.name === "NasiSessionNotFound"
      const isNoModel = error instanceof Error && error.message === "no_model"
      if (!isNotFound && !isNoModel) logError("nasi turn/stream failed", { userId: user.id, error: String(error) })
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: isNotFound ? "Session not found" : isNoModel ? "No model available" : "Turn failed"
        })
      })
    } finally {
      clearInterval(heartbeat)
    }
  })
})

const listRoute = createRoute({
  method: "get",
  path: "/sessions",
  tags: ["Nasi"],
  summary: "List this user's sessions",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            sessions: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                persona: z.string(),
                model: z.string(),
                updatedAt: z.string()
              })
            )
          })
        }
      }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(listRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const sessions = await withStorePath(userSqlitePath(user.id), listSessions)
  return c.json({
    sessions: sessions.map(s => ({
      id: s.id,
      title: s.title,
      persona: s.persona,
      model: s.model,
      updatedAt: s.updatedAt
    }))
  })
})

const getRoute = createRoute({
  method: "get",
  path: "/sessions/{id}",
  tags: ["Nasi"],
  summary: "Get one session",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuidv7() }) },
  responses: {
    200: { description: "OK" },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(getRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { id } = c.req.valid("param")
  const row = await withStorePath(userSqlitePath(user.id), () => loadSessionRow(id))
  if (!row) return notFound(c, "Session not found")
  return c.json({
    id: row.id,
    title: row.title,
    persona: row.persona,
    model: row.model,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt
  })
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/sessions/{id}",
  tags: ["Nasi"],
  summary: "Delete one session",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuidv7() }) },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(deleteRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { id } = c.req.valid("param")
  const ok = await withStorePath(userSqlitePath(user.id), () => deleteSessionRow(id))
  if (!ok) return notFound(c, "Session not found")
  return c.json({ ok: true })
})
