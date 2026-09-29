import { getSessionCookie } from "better-auth/cookies"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import type { AuthSessionUser, RouteVariables } from "../../types"
import { AUTH_COOKIE_PREFIX, auth } from "./auth"

/** Better Auth may store multi-roles as a comma-separated string. */
function userHasRole(user: Pick<AuthSessionUser, "role">, role: string): boolean {
  if (!user.role) return false
  return user.role
    .split(",")
    .map(r => r.trim())
    .includes(role)
}

function toSessionUser(
  user: {
    id: string
    email: string
    name?: string | null
    role?: string | null
    banned?: boolean | null
  } | null
): AuthSessionUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? undefined,
    role: user.role ?? null,
    banned: user.banned ?? null
  }
}

/**
 * Sets `user` from the request's session: its bearer token when it sends one (the TUI, the web's API calls), else its
 * session cookie. Without either there's nothing to look up, so public traffic (health checks, widget scripts, the
 * sandbox socket) costs no database query.
 */
export const authMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  const authHeader = c.req.header("authorization")
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader : undefined
  let user: AuthSessionUser | null = null
  if (bearer || getSessionCookie(c.req.raw.headers, { cookiePrefix: AUTH_COOKIE_PREFIX })) {
    const session = await auth.api.getSession({
      headers: bearer ? new Headers({ authorization: bearer }) : c.req.raw.headers
    })
    user = toSessionUser(session?.user ?? null)
  }
  c.set("user", user)
  await next()
})

/** The signed-in user on a route behind {@link requireAuthMiddleware}; a route mounted without it answers 401 instead of running without one. */
export function sessionUser(c: Context<{ Variables: RouteVariables }>): AuthSessionUser {
  const user = c.get("user")
  if (!user) throw new HTTPException(401, { res: Response.json({ error: "Unauthorized" }, { status: 401 }) })
  return user
}

/** Requires a signed-in, non-banned user. */
export const requireAuthMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  if (user.banned) {
    return c.json({ error: "Forbidden" }, 403)
  }

  await next()
})

/** Requires Better Auth admin role (platform admin). */
export const adminMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  if (user.banned) {
    return c.json({ error: "Forbidden" }, 403)
  }

  if (!userHasRole(user, "admin")) {
    return c.json({ error: "Forbidden" }, 403)
  }

  await next()
})
