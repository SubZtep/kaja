import { zValidator } from "@hono/zod-validator"
import { createCommandRequestSchema } from "@kaja/schemas"
import { z } from "zod"
import type { RouteRegProps } from "#/types"

export function registerAdminCommands(app: RouteRegProps) {
  // Create a new command for a node
  app.post("/admin/nodes/:nodeId/commands", zValidator("json", createCommandRequestSchema), async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const nodeId = c.req.param("nodeId")
    const body = c.req.valid("json")
    const commandService = c.get("commandService")

    const command = await commandService.createCommand(nodeId, body, user.id)

    if (!command) {
      return c.json({ error: "Failed to create command" }, 500)
    }

    return c.json(command, 201)
  })

  // List all commands for a node
  app.get("/admin/nodes/:nodeId/commands", async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const nodeId = c.req.param("nodeId")
    const commandService = c.get("commandService")

    const commands = await commandService.getNodeCommands(nodeId)

    return c.json({ commands })
  })

  // Get a specific command by ID
  app.get(
    "/admin/commands/:commandId",
    zValidator(
      "param",
      z.object({
        commandId: z.string()
      })
    ),
    async c => {
      const user = c.get("user")
      if (!user) return c.json({ error: "Unauthorized" }, 401)

      const { commandId } = c.req.valid("param")
      const commandService = c.get("commandService")

      const command = await commandService.getCommand(commandId)

      if (!command) {
        return c.json({ error: "Command not found" }, 404)
      }

      return c.json(command)
    }
  )
}
