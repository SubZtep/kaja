import { verifySandboxToken } from "@kaja/shared"
import { Hono } from "hono"
import type { ProcessPool } from "./pool"

/** The sandbox's routes: a health check, and each ability's MCP endpoint behind the API-signed token. */
export function createApp(opts: { secret: string; pool: ProcessPool }): Hono {
  const app = new Hono()

  app.get("/health", c => c.json({ ok: true, processes: opts.pool.size }))

  // The token names both the user and the ability, so a user only ever reaches their own server for that one ability.
  app.all("/mcp/:ability", async c => {
    const ability = c.req.param("ability")
    const token = /^Bearer (.+)$/i.exec(c.req.header("authorization") ?? "")?.[1]
    const claims = token ? await verifySandboxToken(token, opts.secret) : undefined
    if (!claims || claims.ability !== ability) return c.json({ error: "unauthorized" }, 401)
    return opts.pool.handle(claims.sub, ability, c.req.raw)
  })

  return app
}
