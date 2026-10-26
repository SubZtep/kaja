import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  widgetMeSchema,
  widgetSourceResponseSchema,
  widgetStatePutSchema,
  widgetStateResponseSchema
} from "@kaja/schema/api"
import { badRequest, errorSchema, notFound, unauthorized } from "../../core/errors"
import { widgetService } from "../../services"
import { widgetTokenAuth, type WidgetVariables } from "./auth"

const visitorParam = z.object({
  visitorId: z.uuid().openapi({ param: { name: "visitorId", in: "path" } })
})

export const widgetRoutes = new OpenAPIHono<{ Variables: WidgetVariables }>()
// Not `*`: this router is mounted at /widget, and a blanket middleware would 401 /widget/manage before that router runs.
widgetRoutes.use("/me", widgetTokenAuth)
widgetRoutes.use("/source", widgetTokenAuth)
widgetRoutes.use("/state/*", widgetTokenAuth)

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Widget"],
  summary: "The calling widget",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: widgetMeSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetRoutes.openapi(meRoute, async c => {
  const described = await widgetService.describe(c.get("widget").id)
  if (!described) return unauthorized(c)
  return c.json(described, 200)
})

const sourceRoute = createRoute({
  method: "get",
  path: "/source",
  tags: ["Widget"],
  summary: "The published source",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: widgetSourceResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Nothing published", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetRoutes.openapi(sourceRoute, async c => {
  const source = await widgetService.publishedSource(c.get("widget").id)
  if (!source) return notFound(c, "Nothing published")
  return c.json(source, 200)
})

const getStateRoute = createRoute({
  method: "get",
  path: "/state/{visitorId}",
  tags: ["Widget"],
  summary: "Visitor state for this widget",
  security: [{ bearerAuth: [] }],
  request: { params: visitorParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: widgetStateResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetRoutes.openapi(getStateRoute, async c => {
  const state = await widgetService.getState(c.get("widget").id, c.req.valid("param").visitorId)
  return c.json({ state }, 200)
})

const putStateRoute = createRoute({
  method: "put",
  path: "/state/{visitorId}",
  tags: ["Widget"],
  summary: "Replace visitor state for this widget",
  security: [{ bearerAuth: [] }],
  request: {
    params: visitorParam,
    body: { content: { "application/json": { schema: widgetStatePutSchema } } }
  },
  responses: {
    200: { description: "Stored", content: { "application/json": { schema: widgetStateResponseSchema } } },
    400: { description: "Too large", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetRoutes.openapi(putStateRoute, async c => {
  const { visitorId } = c.req.valid("param")
  const { state } = c.req.valid("json")
  const stored = await widgetService.putState(c.get("widget").id, visitorId, state)
  if (!stored) return badRequest(c, "State is too large")
  return c.json({ state }, 200)
})
