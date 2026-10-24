import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { NoModelError } from "@kaja/nasi"
import { aiChatRequestSchema, aiChatResponseSchema } from "@kaja/schema/api"
import { widgetSpendLimiter } from "../../core/rate-limit"
import { reportError } from "../../core/report"
import { widgetTokenAuth, type WidgetVariables } from "../widget/auth"
import { completeWidgetChat, recordWidgetChat } from "../widget/complete"

const errorSchema = z.object({ error: z.string() })

export const aiRoutes = new OpenAPIHono<{ Variables: WidgetVariables }>()
aiRoutes.use("*", widgetTokenAuth)
aiRoutes.use("*", widgetSpendLimiter)

const chatRoute = createRoute({
  method: "post",
  path: "/chat",
  tags: ["AI"],
  summary: "One chat completion on the widget's pinned model",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: aiChatRequestSchema } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: aiChatResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    429: { description: "Rate limited", content: { "application/json": { schema: errorSchema } } },
    502: { description: "Model failed", content: { "application/json": { schema: errorSchema } } },
    503: { description: "No model", content: { "application/json": { schema: errorSchema } } }
  }
})

aiRoutes.openapi(chatRoute, async c => {
  const widget = c.get("widget")
  const { messages } = c.req.valid("json")
  try {
    const completion = await completeWidgetChat(widget.model, messages)
    await recordWidgetChat(widget.id, "chat", widget.model, completion)
    return c.json(
      {
        message: completion.message,
        usage: { promptTokens: completion.promptTokens, completionTokens: completion.completionTokens }
      },
      200
    )
  } catch (error) {
    if (error instanceof NoModelError) return c.json({ error: "No model available" }, 503)
    reportError("widget chat failed", error, { widgetId: widget.id })
    return c.json({ error: error instanceof Error ? error.message : "Chat failed" }, 502)
  }
})
