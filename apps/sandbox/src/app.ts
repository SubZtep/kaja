import { SANDBOX_STATS_SCOPE, verifySandboxToken } from "@kaja/shared"
import type { Context } from "hono"
import { Hono } from "hono"
import type { EgressCounts } from "./egress"
import type { ProcessPool } from "./pool"
import { collectStats } from "./stats"

/** The sandbox's routes: a health check, its stats for the API's admins, and each ability's MCP endpoint behind the API-signed token. */
export function createApp(opts: {
  secret: string
  pool: ProcessPool
  /** The egress proxy's counts; zeros without one (tests). */
  egress?: EgressCounts
}): Hono {
  const app = new Hono()

  app.get("/health", c => c.json({ ok: true }))

  app.get("/stats", async c => {
    if ((await claimsOf(c))?.ability !== SANDBOX_STATS_SCOPE) return c.json({ error: "unauthorized" }, 401)
    const egress = opts.egress ?? { open: 0, allowed: 0, refused: 0, failed: 0 }
    return c.json(await collectStats({ pool: opts.pool, egress }))
  })

  // The token names both the user and the ability, so a user only ever reaches their own server for that one ability.
  app.all("/mcp/:ability", async c => {
    const ability = c.req.param("ability")
    const claims = await claimsOf(c)
    if (!claims || claims.ability !== ability) return c.json({ error: "unauthorized" }, 401)
    return opts.pool.handle(claims.sub, ability, c.req.raw)
  })

  function claimsOf(c: Context) {
    const token = /^Bearer (.+)$/i.exec(c.req.header("authorization") ?? "")?.[1]
    return token ? verifySandboxToken(token, opts.secret) : Promise.resolve(undefined)
  }

  return app
}
