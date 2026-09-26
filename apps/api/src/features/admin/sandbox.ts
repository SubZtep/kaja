import { createRoute, z } from "@hono/zod-openapi"
import { adminSandboxResponseSchema, sandboxStatsSchema } from "@kaja/schema/api"
import { SANDBOX_STATS_SCOPE, signSandboxToken } from "@kaja/shared"
import { pool } from "../../core/db"
import type { RouteRegProps } from "../../types"
import { sandboxConfig } from "../nasi/chat"

const errorSchema = z.object({ error: z.string() })
/** The admin page asks every few seconds, so a sandbox that hangs is reported down rather than piling requests up. */
const STATS_TIMEOUT_MS = 3000

const sandboxStatsRoute = createRoute({
  method: "get",
  path: "/sandbox",
  tags: ["Admin"],
  summary: "What the MCP sandbox is running right now: its servers, memory, and start/stop and egress counts",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: adminSandboxResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminSandbox(app: RouteRegProps) {
  app.openapi(sandboxStatsRoute, async c => {
    const sandbox = sandboxConfig()
    if (!sandbox) return c.json({ status: "off" as const }, 200)
    const user = c.get("user")!
    const token = await signSandboxToken(
      { sub: user.id, ability: SANDBOX_STATS_SCOPE, exp: Math.floor(Date.now() / 1000) + 60 },
      sandbox.secret
    )
    let stats: z.infer<typeof sandboxStatsSchema>
    try {
      const res = await fetch(new URL("/stats", sandbox.url), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(STATS_TIMEOUT_MS)
      })
      if (!res.ok) throw new Error(`the sandbox answered ${res.status}`)
      stats = sandboxStatsSchema.parse(await res.json())
    } catch (error) {
      return c.json({ status: "down" as const, error: error instanceof Error ? error.message : String(error) }, 200)
    }
    const ids = [...new Set(stats.servers.map(server => server.user))]
    const { rows } = await pool.query<{ id: string; email: string }>(
      'SELECT id::text, email FROM "user" WHERE id::text = ANY($1::text[])',
      [ids]
    )
    return c.json(
      { status: "up" as const, stats, emails: Object.fromEntries(rows.map(row => [row.id, row.email])) },
      200
    )
  })
}
