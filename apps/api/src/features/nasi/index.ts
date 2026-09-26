import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  type AgentDelta,
  categorizeError,
  type FinalizedAgentEvent,
  LOAD_SKILL_TOOL,
  listCloudToolNames
} from "@kaja/nasi"
import {
  NasiCompactRequestSchema,
  NasiCompactResponseSchema,
  NasiInfoResponseSchema,
  NasiPersonasResponseSchema,
  NasiTurnRequestSchema,
  NasiTurnResponseSchema
} from "@kaja/schema/nasi"
import { streamSSE } from "hono/streaming"
import { pool } from "../../core/db"
import { nasiTurnRateLimiter } from "../../core/rate-limit"
import { reportError } from "../../core/report"
import { abilityService } from "../../services"
import type { RouteVariables } from "../../types"
import { badGateway, badRequest, conflict, internalError, notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth/middleware"
import {
  compactUserSession,
  nasiToolDeps,
  openUserTurnStream,
  pinnedModelFor,
  resolveModelWithProvider,
  runUserTurn
} from "./chat"
import { createPostgresStore } from "./pg-store"
import { toolImageUrl } from "./tool-image"

const HEARTBEAT_INTERVAL_MS = 15_000
const NOTHING_TO_APPROVE = "No tool call is waiting for approval"

export const nasiRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
nasiRoutes.use("*", requireAuthMiddleware)
nasiRoutes.use("/turn", nasiTurnRateLimiter)
nasiRoutes.use("/turn/stream", nasiTurnRateLimiter)
nasiRoutes.use("/compact", nasiTurnRateLimiter)

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
    404: { description: "Session not found", content: { "application/json": { schema: errorSchema } } },
    409: {
      description: "`approval` sent, but no tool call is waiting for one",
      content: { "application/json": { schema: errorSchema } }
    }
  }
})

nasiRoutes.openapi(turnRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const body = c.req.valid("json")
  try {
    const result = await runUserTurn(user.id, body)
    return c.json(result)
  } catch (error) {
    if (error instanceof Error && error.name === "NasiSessionNotFound") return notFound(c, "Session not found")
    if (error instanceof Error && error.name === "NasiNothingToApprove") return conflict(c, NOTHING_TO_APPROVE)
    if (error instanceof Error && error.message === "no_model") return notFound(c, "No model available")
    if (error instanceof Error && error.name === "NasiModelUnavailable") return badGateway(c, error.message)
    const { category, message } = categorizeError(error)
    reportError("nasi turn failed", error, { userId: user.id, category })
    return internalError(c, message)
  }
})

/** SSE event name for each AgentEvent type the client should see; events with no entry (display_image) are not forwarded, and tool_image goes as a signed URL (see {@link sseEvent}). */
const SSE_EVENT_NAME: Partial<Record<string, string>> = {
  delta: "delta",
  reasoning: "reasoning",
  message: "message",
  tool_call: "tool_call",
  client_tool_call: "client_tool_call",
  confirm_tool: "confirm_tool",
  ask_user: "ask_user",
  persona_switch: "persona_switch",
  compacted: "compacted",
  condensed: "condensed",
  usage: "usage",
  final: "final",
  tool_image: "tool_image"
}

/** What the client gets for an event: as is, except a tool image, whose server-side file goes to storage and becomes a signed URL (the file is gone after the turn). */
async function sseEvent(
  event: FinalizedAgentEvent | AgentDelta,
  userId: string,
  sessionId: string | undefined
): Promise<object> {
  if (event.type !== "tool_image") return event
  const { path, mimeType } = event
  return { type: "tool_image", mimeType, url: await toolImageUrl(userId, sessionId, path, mimeType) }
}

/** The `error` event's body for a failed stream: the known failures by name, anything else categorized and logged. */
function streamErrorBody(error: unknown, userId: string): { error: string; category?: string } {
  if (error instanceof Error && error.name === "NasiSessionNotFound") return { error: "Session not found" }
  if (error instanceof Error && error.name === "NasiNothingToApprove") return { error: NOTHING_TO_APPROVE }
  if (error instanceof Error && error.message === "no_model") return { error: "No model available" }
  if (error instanceof Error && error.name === "NasiModelUnavailable") return { error: error.message }
  const { category, message } = categorizeError(error)
  reportError("nasi turn/stream failed", error, { userId, category })
  return { error: message, category }
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
      const gen = openUserTurnStream(user.id, body)
      let next = await gen.next()
      while (!next.done) {
        const name = SSE_EVENT_NAME[next.value.type]
        if (name)
          await stream.writeSSE({
            event: name,
            data: JSON.stringify(await sseEvent(next.value, user.id, body.session))
          })
        next = await gen.next()
      }
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify({ session: next.value.session, status: next.value.status })
      })
    } catch (error) {
      await stream.writeSSE({ event: "error", data: JSON.stringify(streamErrorBody(error, user.id)) })
    } finally {
      clearInterval(heartbeat)
    }
  })
})

const compactRoute = createRoute({
  method: "post",
  path: "/compact",
  tags: ["Nasi"],
  summary: "Summarise a session now, keeping its latest turn word for word",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: NasiCompactRequestSchema } }, required: true }
  },
  responses: {
    200: {
      description: "Compacted, or `compacted: null` when there was nothing to summarise yet",
      content: { "application/json": { schema: NasiCompactResponseSchema } }
    },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Session not found", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(compactRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const body = c.req.valid("json")
  try {
    return c.json({ compacted: (await compactUserSession(user.id, body)) ?? null })
  } catch (error) {
    if (error instanceof Error && error.name === "NasiSessionNotFound") return notFound(c, "Session not found")
    if (error instanceof Error && error.message === "no_model") return notFound(c, "No model available")
    const { category, message } = categorizeError(error)
    reportError("nasi compact failed", error, { userId: user.id, category })
    return internalError(c, message)
  }
})

const infoRoute = createRoute({
  method: "get",
  path: "/info",
  tags: ["Nasi"],
  summary: "Resolved persona, model, and available tools for cloud chat",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ session: z.uuidv7().optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: NasiInfoResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No model available", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(infoRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { session } = c.req.valid("query")

  const pinnedModel = await pinnedModelFor(user.id, session)
  const result = await resolveModelWithProvider(pinnedModel)
  if (!result) return notFound(c, "No model available")

  const personas = await abilityService.personasForUser(user.id)
  const persona = personas[0]
  const skills = await abilityService.skillsForUser(user.id)
  const keys = new Set(await abilityService.keyNames(user.id))
  // Tool and MCP abilities as a turn loads them (one that requires a key only once the user saved it), without connecting: MCP abilities in the cloud have a fixed tool list.
  const loads = (ability: { name: string; auth: { type: string; optional?: boolean } }) =>
    ability.auth.type !== "apiKey" || ability.auth.optional || keys.has(ability.name)
  const httpTools = (await abilityService.httpToolsForUser(user.id))
    .filter(loads)
    .flatMap(ability => ability.tools.map(t => t.name))
  const mcpTools = (await abilityService.mcpForUser(user.id)).filter(loads).flatMap(ability => ability.tools ?? [])
  const tools = [
    ...(await listCloudToolNames(nasiToolDeps())),
    ...(skills.length > 0 ? [LOAD_SKILL_TOOL] : []),
    ...httpTools,
    ...mcpTools
  ]

  return c.json({
    persona: { id: persona?.id ?? "default", label: persona?.label ?? "default" },
    personas: personas.map(p => ({ id: p.id, label: p.label })),
    model: result.model.model,
    tools
  })
})

const personasRoute = createRoute({
  method: "get",
  path: "/personas",
  tags: ["Nasi"],
  summary: "Every persona in the cloud catalog (id and label), default first, for pickers like the widget form",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: NasiPersonasResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(personasRoute, async c => {
  if (!c.get("user")) return unauthorized(c)
  const personas = await abilityService.personaCatalog()
  return c.json({ personas: personas.map(p => ({ id: p.id, label: p.label })) }, 200)
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
  const sessions = await createPostgresStore(pool, user.id).listSessions()
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
  const row = await createPostgresStore(pool, user.id).loadSession(id)
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
  const ok = await createPostgresStore(pool, user.id).deleteSession(id)
  if (!ok) return notFound(c, "Session not found")
  return c.json({ ok: true })
})
