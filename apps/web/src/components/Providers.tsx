import { KajaAPI } from "@kaja/sdk"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { FormDevtoolsPanel } from "@tanstack/react-form-devtools"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { createContext, type ReactNode } from "react"
import { ToastContainer } from "react-toastify"
import { getAuthClient } from "../hooks/auth-client"

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SDKProvider>
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
    </SDKProvider>
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

// MARK: API SDK

export const SDKContext = createContext<KajaAPI | null>(null)

function SDKProvider({ children }: Readonly<{ children: ReactNode }>) {
  const authClient = getAuthClient(import.meta.env.VITE_API_URL!)

  // Create SDK instance with a function that retrieves the current access token
  const sdkInstance = new KajaAPI({
    baseUrl: import.meta.env.VITE_API_URL!,
    getAccessToken: async () => {
      const session = await authClient.getSession()
      return session.data?.session?.token ?? null
    }
  })

  return <SDKContext.Provider value={sdkInstance}>{children}</SDKContext.Provider>
}
