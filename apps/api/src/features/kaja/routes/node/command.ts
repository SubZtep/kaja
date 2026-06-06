import { createRoute, z } from "@hono/zod-openapi"
import { commandSchema } from "@kaja/schema"
import type { RouteRegProps } from "../../../../types"

const startCommandRoute = createRoute({
  method: "post",
  path: "/:id/commands/{commandId}/start",
  tags: ["Node"],
  summary: "Start command execution",
  description: "CLI calls this when it starts executing a command",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" }),
      commandId: z
        .string()
        .openapi({ param: { name: "commandId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    })
  },
  responses: {
    200: {
      description: "Command started",
      content: {
        "application/json": {
          schema: commandSchema
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: "Command not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
})

const completeCommandRoute = createRoute({
  method: "post",
  path: "/:id/commands/{commandId}/complete",
  tags: ["Node"],
  summary: "Complete command execution",
  description: "CLI calls this when command execution finishes successfully",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" }),
      commandId: z
        .string()
        .openapi({ param: { name: "commandId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            result: z.unknown(),
            exitCode: z.number().int().optional()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Command completed",
      content: {
        "application/json": {
          schema: commandSchema
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: "Command not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
})

const failCommandRoute = createRoute({
  method: "post",
  path: "/:id/commands/{commandId}/fail",
  tags: ["Node"],
  summary: "Fail command execution",
  description: "CLI calls this when command execution fails",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" }),
      commandId: z
        .string()
        .openapi({ param: { name: "commandId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            exitCode: z.number().int().optional()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Command marked as failed",
      content: {
        "application/json": {
          schema: commandSchema
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: "Command not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
})

export function registerCommandLifecycle(app: RouteRegProps) {
  // Start command
  app.openapi(startCommandRoute, async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const { commandId } = c.req.valid("param")
    const commandService = c.get("commandService")

    const command = await commandService.startCommand(commandId)

    if (!command) {
      return c.json({ error: "Command not found or already started" }, 404)
    }

    return c.json(command)
  })

  // Complete command
  app.openapi(completeCommandRoute, async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const { commandId } = c.req.valid("param")
    const body = c.req.valid("json")
    const commandService = c.get("commandService")

    const command = await commandService.completeCommand(commandId, body.result, body.exitCode)

    if (!command) {
      return c.json({ error: "Command not found or not executing" }, 404)
    }

    return c.json(command)
  })

  // Fail command
  app.openapi(failCommandRoute, async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const { commandId } = c.req.valid("param")
    const body = c.req.valid("json")
    const commandService = c.get("commandService")

    const command = await commandService.failCommand(commandId, body.error, body.exitCode)

    if (!command) {
      return c.json({ error: "Command not found or not executing" }, 404)
    }

    return c.json(command)
  })
}
