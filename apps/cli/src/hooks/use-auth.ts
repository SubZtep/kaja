import { useEffect } from "react"
import { authClient } from "../lib/auth-client"

export function useAuth() {
  const session = authClient.useSession()

  useEffect(() => {
    void session.refetch()
  }, [session.refetch])

  return {
    isLoading: session.isPending,
    isLoggedIn: Boolean(session.data?.user)
    // isLoggedIn: Boolean(session.data?.data?.user),
    // session: session.data?.data,
    // error: session.data?.error ?? session.error,
    // refetch: session.refetch
  }
}
