import { KajaAPI } from "@kaja/sdk"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createContext, type ReactNode, useMemo } from "react"
import { ToastContainer } from "react-toastify"
import { getAuthClient } from "../hooks/auth-client"

export function Providers({ apiUrl, children }: Readonly<{ apiUrl: string; children: React.ReactNode }>) {
  return (
    <SDKProvider apiUrl={apiUrl}>
      <TanStackQueryProvider>
        {children}

        <ToastContainer theme="colored" position="top-center" />
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

function SDKProvider({ apiUrl, children }: Readonly<{ apiUrl: string; children: ReactNode }>) {
  const authClient = getAuthClient(apiUrl)

  // Create SDK instance with a function that retrieves the current access token
  const sdkInstance = useMemo(
    () =>
      new KajaAPI({
        baseUrl: apiUrl,
        getAccessToken: async () => {
          const session = await authClient.getSession()
          return session.data?.session?.token ?? null
        }
      }),
    [apiUrl, authClient]
  )

  return <SDKContext.Provider value={sdkInstance}>{children}</SDKContext.Provider>
}
