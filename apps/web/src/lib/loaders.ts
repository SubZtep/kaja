import { redirect } from "@tanstack/react-router"
import { getSession } from "./session"

/** Use the loader to require a session, redirecting to sign-in (or the dashboard) rather than throwing. */
export const userRequired = async (role?: "user" | "admin", redirectTo?: string) => {
  const session = await getSession()
  if (!session?.user) {
    throw redirect({ to: "/signin", search: redirectTo ? { redirect: redirectTo } : undefined })
  }
  if (role && session.user.role !== role) {
    throw redirect({ to: "/dashboard" })
  }
  return session.user
}

/** For pages only a signed-out visitor needs (sign in, sign up): a signed-in user goes on to `redirectTo` (a path on this site) or the dashboard. */
export const guestOnly = async (redirectTo?: string) => {
  const session = await getSession()
  if (!session?.user) return
  // Only a path here, never another site: `redirect` comes from the URL.
  if (redirectTo?.startsWith("/") && !redirectTo.startsWith("//")) throw redirect({ href: redirectTo })
  throw redirect({ to: "/dashboard" })
}
