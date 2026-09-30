import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { startTelegramLinkResponseSchema, telegramLinkStatusSchema } from "@kaja/schema/api"
import { getBotUsername } from "../../features/telegram"
import { telegramLinkService } from "../../services"
import type { RouteVariables } from "../../types"
import { notFound } from "../../types/errors"
import { requireAuthMiddleware, sessionUser } from "../auth"

const errorSchema = z.object({ error: z.string() })

export const telegramAdminRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
telegramAdminRoutes.use("*", requireAuthMiddleware)

const linkStatusRoute = createRoute({
  method: "get",
  path: "/link",
  tags: ["Telegram"],
  summary: "Whether the signed-in user's account is linked to Telegram, and since when",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: telegramLinkStatusSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

telegramAdminRoutes.openapi(linkStatusRoute, async c => {
  const user = sessionUser(c)
  const linkedAt = await telegramLinkService.linkedAt(user.id)
  return c.json({ linked: linkedAt !== null, linkedAt }, 200)
})

const unlinkRoute = createRoute({
  method: "delete",
  path: "/link",
  tags: ["Telegram"],
  summary: "Disconnect the signed-in user's account from Telegram",
  description: "The cloud bot then treats that Telegram account as unlinked; linking again needs a new deep link.",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "Disconnected", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not linked", content: { "application/json": { schema: errorSchema } } }
  }
})

telegramAdminRoutes.openapi(unlinkRoute, async c => {
  const user = sessionUser(c)
  if (!(await telegramLinkService.unlink(user.id))) return notFound(c, "Not linked to Telegram")
  return c.json({ ok: true }, 200)
})

const linkRoute = createRoute({
  method: "post",
  path: "/link",
  tags: ["Telegram"],
  summary: "Start a Telegram account link — returns a one-time deep link token",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: startTelegramLinkResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Telegram bot not configured", content: { "application/json": { schema: errorSchema } } }
  }
})

telegramAdminRoutes.openapi(linkRoute, async c => {
  const user = sessionUser(c)

  const botUsername = getBotUsername()
  if (!botUsername) return notFound(c, "Telegram bot is not configured")

  const { token } = await telegramLinkService.createLinkToken(user.id)
  return c.json({ token, botUsername }, 200)
})
