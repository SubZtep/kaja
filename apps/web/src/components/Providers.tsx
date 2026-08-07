import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { ToastContainer } from "react-toastify"

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TanStackQueryProvider>
      {children}
      <ToastContainer theme="colored" position="top-center" />
    </TanStackQueryProvider>
  )
}

// MARK: React Query

let context:
  | {
      queryClient: QueryClient
    }
  | undefined

export function getContext() {
  if (context) {
    return context
  }

  const queryClient = new QueryClient()

  context = {
    queryClient
  }

  return context
}

function TanStackQueryProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { queryClient } = getContext()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
