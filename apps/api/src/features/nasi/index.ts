import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  type AgentDelta,
  categorizeError,
  type FinalizedAgentEvent,
  LOAD_SKILL_TOOL,
  listCloudToolNames,
  personaAbilities
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
import { clientIp, nasiTurnRateLimiter } from "../../core/rate-limit"
import { reportError } from "../../core/report"
import { abilityService } from "../../services"
import type { RouteVariables } from "../../types"
import {
  badRequest,
  internalError,
  knownTurnError,
  knownTurnErrorResponse,
  notFound,
  serviceUnavailable
} from "../../types/errors"
import { requireAuthMiddleware, sessionUser } from "../auth/middleware"
import { rememberPlace } from "../sandbox"
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

export const nasiRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
nasiRoutes.use("*", requireAuthMiddleware)
// Where the user is (from their request's IP, at most once a day), so a shared MCP sandbox near them can be picked.
nasiRoutes.use("*", async (c, next) => {
  const user = c.get("user")
  if (user) rememberPlace(user.id, clientIp(c))
  await next()
})
nasiRoutes.use("/turn", nasiTurnRateLimiter)
nasiRoutes.use("/turn/stream", nasiTurnRateLimiter)
nasiRoutes.use("/compact", nasiTurnRateLimiter)

const errorSchema = z.object({ error: z.string() })

/** An `{ error }` JSON response for a route's `responses`. */
const jsonError = (description: string) => ({ description, content: { "application/json": { schema: errorSchema } } })

/** Everything a route that runs the model can answer besides success (see `knownTurnError`); `conflict` says when it answers 409. */
const turnErrorResponses = (conflict: string) => ({
  400: jsonError("Bad request"),
  401: jsonError("Unauthorized"),
  404: jsonError("Session not found"),
  409: jsonError(conflict),
  500: jsonError("The turn failed unexpectedly"),
  502: jsonError("The model provider failed"),
  503: jsonError("No model available")
})

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
    ...turnErrorResponses("`approval` sent, but no tool call is waiting for one")
  }
})

nasiRoutes.openapi(turnRoute, async c => {
  const user = sessionUser(c)
  const body = c.req.valid("json")
  try {
    const result = await runUserTurn(user.id, body)
    return c.json(result, 200)
  } catch (error) {
    const known = knownTurnErrorResponse(c, error)
    if (known) return known
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

/** The `error` event's body for a failed stream: a known failure's message, anything else categorized and logged. */
function streamErrorBody(error: unknown, userId: string): { error: string; category?: string } {
  const known = knownTurnError(error)
  if (known) return { error: known.message }
  const { category, message } = categorizeError(error)
  reportError("nasi turn/stream failed", error, { userId, category })
  return { error: message, category }
}

nasiRoutes.post("/turn/stream", async c => {
  const user = sessionUser(c)
  // c.req.json() would parse a text/plain body too, the one kind a cross-site form can send without a preflight
  if (!c.req.header("content-type")?.startsWith("application/json")) return badRequest(c, "Invalid request body")
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
    ...turnErrorResponses("The session is in a state that can't be compacted")
  }
})

nasiRoutes.openapi(compactRoute, async c => {
  const user = sessionUser(c)
  const body = c.req.valid("json")
  try {
    return c.json({ compacted: (await compactUserSession(user.id, body)) ?? null }, 200)
  } catch (error) {
    const known = knownTurnErrorResponse(c, error)
    if (known) return known
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
    503: { description: "No model available", content: { "application/json": { schema: errorSchema } } }
  }
})

nasiRoutes.openapi(infoRoute, async c => {
  const user = sessionUser(c)
  const { session } = c.req.valid("query")

  const pinnedModel = await pinnedModelFor(user.id, session)
  const result = await resolveModelWithProvider(pinnedModel)
  if (!result) return serviceUnavailable(c, "No model available")

  const personas = await abilityService.personaCatalog()
  const persona = personas[0]
  // The starting persona's abilities, as a turn loads them (one that requires a key only once the user saved it), without connecting: MCP abilities in the cloud have a fixed tool list.
  const entries = persona ? personaAbilities(persona) : new Map()
  const keys = new Set(await abilityService.keyNames(user.id))
  const loads = (ability: { name: string; auth: { type: string; optional?: boolean } }) =>
    entries.has(ability.name) && (ability.auth.type !== "apiKey" || ability.auth.optional || keys.has(ability.name))
  const narrowed = (ability: string, names: string[]) =>
    names.filter(name => entries.get(ability)?.tools?.includes(name) ?? true)
  const httpTools = (await abilityService.httpTools()).filter(loads).flatMap(ability =>
    narrowed(
      ability.name,
      ability.tools.map(t => t.name)
    )
  )
  const mcpTools = (await abilityService.mcpAbilities())
    .filter(loads)
    .flatMap(ability => narrowed(ability.name, ability.tools ?? []))
  const loadsSkills = (await abilityService.skills()).some(
    skill => entries.has(skill.name) && entries.get(skill.name)?.skill !== "off"
  )
  const tools = [
    ...(await listCloudToolNames(nasiToolDeps())),
    ...(loadsSkills ? [LOAD_SKILL_TOOL] : []),
    ...httpTools,
    ...mcpTools
  ]

  return c.json(
    {
      persona: { id: persona?.id ?? "default", label: persona?.label ?? "default" },
      personas: personas.map(p => ({ id: p.id, label: p.label })),
      model: result.model.model,
      tools
    },
    200
  )
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
  const user = sessionUser(c)
  const sessions = await createPostgresStore(pool, user.id).listSessions()
  return c.json(
    {
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        persona: s.persona,
        model: s.model,
        updatedAt: s.updatedAt
      }))
    },
    200
  )
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
  const user = sessionUser(c)
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
  const user = sessionUser(c)
  const { id } = c.req.valid("param")
  const ok = await createPostgresStore(pool, user.id).deleteSession(id)
  if (!ok) return notFound(c, "Session not found")
  return c.json({ ok: true }, 200)
})
