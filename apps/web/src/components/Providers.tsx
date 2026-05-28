import { TanStackDevtools } from "@tanstack/react-devtools"
import { FormDevtoolsPanel } from "@tanstack/react-form-devtools"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import type { ReactNode } from "react"
import { ToastContainer } from "react-toastify"

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <TanStackQueryProvider>
      {children}

      <ToastContainer theme="colored" position="top-center" />
      <TanStackDevtools
        config={{
          position: "bottom-right"
        }}
        plugins={[
          {
            name: "Tanstack Form",
            render: <FormDevtoolsPanel />
          },
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />
          },
          {
            name: "Tanstack Query",
            render: <ReactQueryDevtoolsPanel />
          }
        ]}
      />
    </TanStackQueryProvider>
  )
}

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
