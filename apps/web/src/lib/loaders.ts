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
