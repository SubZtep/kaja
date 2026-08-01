import { createRoute, z } from "@hono/zod-openapi"
import type { RouteRegProps } from "../../types"
import { renderMcpToml } from "./render-toml"

const mcpTomlRoute = createRoute({
  method: "get",
  path: "/mcp.toml",
  tags: ["Config"],
  summary: "Generate mcp.toml from enabled MCP servers",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/toml": {
          schema: z.string()
        }
      }
    }
  }
})

export function registerMcpToml(app: RouteRegProps) {
  app.openapi(mcpTomlRoute, async c => {
    const mcpServerService = c.get("mcpServerService")
    const servers = await mcpServerService.listEnabled()
    const toml = renderMcpToml(servers)
    return c.text(toml, 200, { "Content-Type": "application/toml" }) as any
  })
}
