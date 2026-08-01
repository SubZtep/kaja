import { createRoute, z } from "@hono/zod-openapi"
import {
  createMcpServerRequestSchema,
  listMcpServersResponseSchema,
  mcpServerSchema,
  updateMcpServerRequestSchema
} from "@kaja/schema"
import type { RouteRegProps } from "../../types"
import { notFound, unauthorized } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })

const listMcpServersRoute = createRoute({
  method: "get",
  path: "/mcp-servers",
  tags: ["Admin"],
  summary: "List all MCP servers",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "List of MCP servers",
      content: { "application/json": { schema: listMcpServersResponseSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const createMcpServerRoute = createRoute({
  method: "post",
  path: "/mcp-servers",
  tags: ["Admin"],
  summary: "Create an MCP server",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createMcpServerRequestSchema } } }
  },
  responses: {
    201: {
      description: "MCP server created successfully",
      content: { "application/json": { schema: mcpServerSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const updateMcpServerRoute = createRoute({
  method: "patch",
  path: "/mcp-servers/{id}",
  tags: ["Admin"],
  summary: "Update an MCP server",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    }),
    body: { content: { "application/json": { schema: updateMcpServerRequestSchema } } }
  },
  responses: {
    200: {
      description: "MCP server updated successfully",
      content: { "application/json": { schema: mcpServerSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "MCP server not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const deleteMcpServerRoute = createRoute({
  method: "delete",
  path: "/mcp-servers/{id}",
  tags: ["Admin"],
  summary: "Delete an MCP server",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
    })
  },
  responses: {
    200: {
      description: "MCP server deleted successfully",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "MCP server not found", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminMcpServers(app: RouteRegProps) {
  app.openapi(listMcpServersRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const mcpServerService = c.get("mcpServerService")
    const mcpServers = await mcpServerService.list()
    return c.json({ mcpServers })
  })

  app.openapi(createMcpServerRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const body = c.req.valid("json")
    const mcpServerService = c.get("mcpServerService")
    const mcpServer = await mcpServerService.create(body)
    return c.json(mcpServer, 201)
  })

  app.openapi(updateMcpServerRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const body = c.req.valid("json")
    const mcpServerService = c.get("mcpServerService")
    const mcpServer = await mcpServerService.update(id, body)
    if (!mcpServer) return notFound(c, "MCP server not found")
    return c.json(mcpServer)
  })

  app.openapi(deleteMcpServerRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const mcpServerService = c.get("mcpServerService")
    const success = await mcpServerService.delete(id)
    if (!success) return notFound(c, "MCP server not found")
    return c.json({ success })
  })
}
