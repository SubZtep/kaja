import { getSession } from "./session"

/** Use the loader to require a session. */
export const userRequired = async (role?: "user" | "admin") => {
  const session = await getSession()
  if (!session?.user) {
    throw new Error("Unauthorized: You must be signed in to access to this page.")
  }
  if (role && session.user.role !== role) {
    throw new Error("Unauthorized: You don’t have access to this page.")
  }
  return session.user
}
