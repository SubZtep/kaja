import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disables window focus fetching since a CLI doesn't have a "window focus"
      refetchOnWindowFocus: false,

      // Prevents background fetching if the internet momentarily drops out
      refetchOnReconnect: false,

      // Optional: Stale time defaults to 0. If you don't want the CLI
      // re-requesting the API during keyboard navigation/re-renders, up this value.
      staleTime: 1000 * 60 * 5
    }
  }
})
