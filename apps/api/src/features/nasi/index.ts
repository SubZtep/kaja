import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { deleteSessionRow, listSessions, loadSessionRow, withStorePath } from "@kaja/nasi"
import { NasiTurnRequestSchema, NasiTurnResponseSchema } from "@kaja/schema/nasi"
import type { RouteVariables } from "../../types"
import { notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth/middleware"
import { runUserTurn } from "./chat"
import { withUserLock } from "./mutex"
import { userSqlitePath } from "./paths"

export const nasiRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
nasiRoutes.use("*", requireAuthMiddleware)

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
