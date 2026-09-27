import { createRoute, z } from "@hono/zod-openapi"
import { type AdminSandboxEntry, adminSandboxResponseSchema } from "@kaja/schema/api"
import { pool } from "../../core/db"
import { sandboxService } from "../../services"
import type { RouteRegProps } from "../../types"
import { tunnelFor, userForPseudonym } from "../sandbox"

const errorSchema = z.object({ error: z.string() })

const sandboxStatsRoute = createRoute({
  method: "get",
  path: "/sandbox",
  tags: ["Admin"],
  summary: "Every registered MCP sandbox, and what the online ones are running right now",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: adminSandboxResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminSandbox(app: RouteRegProps) {
  app.openapi(sandboxStatsRoute, async c => {
    const sandboxes = await sandboxService.list()
    const entries: AdminSandboxEntry[] = await Promise.all(
      sandboxes.map(async sandbox => {
        const tunnel = sandbox.online ? tunnelFor(sandbox.id) : undefined
        if (!tunnel) return { sandbox, stats: null, error: null }
        try {
          const stats = await tunnel.stats()
          // A sandbox only knows users by pseudonym; the admin sees who they are.
          const servers = stats.servers.map(server => ({
            ...server,
            user: userForPseudonym(server.user) ?? server.user
          }))
          return { sandbox, stats: { ...stats, servers }, error: null }
        } catch (error) {
          return { sandbox, stats: null, error: error instanceof Error ? error.message : String(error) }
        }
      })
    )
    const ids = new Set<string>()
    for (const entry of entries) {
      if (entry.sandbox.ownerId) ids.add(entry.sandbox.ownerId)
      for (const server of entry.stats?.servers ?? []) ids.add(server.user)
    }
    const { rows } = await pool.query<{ id: string; email: string }>(
      'SELECT id::text, email FROM "user" WHERE id::text = ANY($1::text[])',
      [[...ids]]
    )
    return c.json({ sandboxes: entries, emails: Object.fromEntries(rows.map(row => [row.id, row.email])) }, 200)
  })
}
