import { createRoute, z } from "@hono/zod-openapi"
import { commandSchema, createCommandRequestSchema } from "@kaja/schemas"
import type { RouteRegProps } from "../../../../types"
import { badRequest, internalError, notFound, unauthorized } from "../../../../types/errors"
import { validateCommand } from "../../services/command-validator"

const createCommandRoute = createRoute({
  method: "post",
  path: "/admin/nodes/{nodeId}/commands",
  tags: ["Admin"],
  summary: "Create a command for a node",
  description: "Queue a new command to be executed by the specified node",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      nodeId: z
        .string()
        .openapi({ param: { name: "nodeId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    }),
    body: {
      content: {
        "application/json": {
          schema: createCommandRequestSchema
        }
      }
    }
  },
  responses: {
    201: {
      description: "Command created successfully",
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
    500: {
      description: "Failed to create command",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
})

const listNodeCommandsRoute = createRoute({
  method: "get",
  path: "/admin/nodes/{nodeId}/commands",
  tags: ["Admin"],
  summary: "List all commands for a node",
  description: "Retrieve all commands associated with a specific node",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      nodeId: z
        .string()
        .openapi({ param: { name: "nodeId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    })
  },
  responses: {
    200: {
      description: "List of commands",
      content: {
        "application/json": {
          schema: z.object({
            commands: z.array(commandSchema)
          })
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
    }
  }
})

const getCommandRoute = createRoute({
  method: "get",
  path: "/admin/commands/{commandId}",
  tags: ["Admin"],
  summary: "Get a specific command by ID",
  description: "Retrieve detailed information about a specific command",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      commandId: z
        .string()
        .openapi({ param: { name: "commandId", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    })
  },
  responses: {
    200: {
      description: "Command details",
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

export function registerAdminCommands(app: RouteRegProps) {
  // Create a new command for a node
  app.openapi(createCommandRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { nodeId } = c.req.valid("param")
    const body = c.req.valid("json")
    const commandService = c.get("commandService")
    const nodeService = c.get("nodeService")

    // Validate command for security
    const validationError = validateCommand(body)
    if (validationError) {
      return badRequest(c, validationError)
    }

    // Verify node exists and is active
    const node = await nodeService.getNode(nodeId, user.id)
    if (!node) {
      return notFound(c, "Node not found")
    }

    if (node.status === "inactive") {
      return badRequest(c, "Cannot send command to inactive node")
    }

    const command = await commandService.createCommand(nodeId, body, user.id)

    if (!command) {
      return internalError(c, "Failed to create command")
    }

    return c.json(command, 201)
  })

  // List all commands for a node
  app.openapi(listNodeCommandsRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return unauthorized(c)
    }

    const { nodeId } = c.req.valid("param")
    const commandService = c.get("commandService")

    const commands = await commandService.getNodeCommands(nodeId)

    return c.json({ commands })
  })

  // Get a specific command by ID
  app.openapi(getCommandRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return unauthorized(c)
    }

    const { commandId } = c.req.valid("param")
    const commandService = c.get("commandService")

    const command = await commandService.getCommand(commandId)

    if (!command) {
      return notFound(c, "Command not found")
    }

    return c.json(command)
  })
}
