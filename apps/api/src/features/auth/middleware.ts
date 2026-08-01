import { createMiddleware } from "hono/factory"
import type { AuthSessionUser, RouteVariables } from "../../types"
import { auth } from "./auth"

/** Better Auth may store multi-roles as a comma-separated string. */
export function userHasRole(user: Pick<AuthSessionUser, "role">, role: string): boolean {
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

export const authMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  let user: AuthSessionUser | null = null

  // Bearer token from Authorization header
  const authHeader = c.req.header("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const session = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) })
    user = toSessionUser(session?.user ?? null)
  }

  // Cookie session fallback
  if (!user) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    user = toSessionUser(session?.user ?? null)
  }

  c.set("user", user)

  await next()
})

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
