import { redirect } from "@tanstack/react-router"
import type { SessionData } from "./session"

/**
 * Use the loader to require a session (the root's, from route context), redirecting to sign-in (or the dashboard)
 * rather than throwing.
 */
export const userRequired = (session: SessionData | null, role?: "user" | "admin", redirectTo?: string) => {
  if (!session?.user) {
    throw redirect({ to: "/signin", search: redirectTo ? { redirect: redirectTo } : undefined })
  }
  if (role && session.user.role !== role) {
    throw redirect({ to: "/dashboard" })
  }
  return session.user
}

/**
 * For pages only a signed-out visitor needs (sign in, sign up): a signed-in user goes on to `redirectTo` (a path on
 * this site) or the dashboard.
 */
export const guestOnly = (session: SessionData | null, redirectTo?: string) => {
  if (!session?.user) return
  // Only a path here, never another site: `redirect` comes from the URL.
  if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//")) throw redirect({ href: redirectTo })
  throw redirect({ to: "/dashboard" })
}
