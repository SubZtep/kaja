import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { startTelegramLinkResponseSchema } from "@kaja/schema/api"
import { getBotUsername } from "../../features/telegram"
import { telegramLinkService } from "../../services"
import type { RouteVariables } from "../../types"
import { notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"

const errorSchema = z.object({ error: z.string() })

export const telegramAdminRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
telegramAdminRoutes.use("*", requireAuthMiddleware)

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
  const user = c.get("user")
  if (!user) return unauthorized(c)

  const botUsername = getBotUsername()
  if (!botUsername) return notFound(c, "Telegram bot is not configured")

  const { token } = await telegramLinkService.createLinkToken(user.id)
  return c.json({ token, botUsername })
})
