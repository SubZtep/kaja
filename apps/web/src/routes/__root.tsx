import { error } from "@kaja/logger"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, ErrorComponent, HeadContent, Scripts } from "@tanstack/react-router"
import { useEffect } from "react"
import { Providers } from "../components/Providers"
import { getSession } from "../lib/session"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    let session: Awaited<ReturnType<typeof getSession>> | null = null
    try {
      session = await getSession()
    } catch (err) {
      const err2 = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err
      error("DIAGNOSTIC: getSession failed in root loader", { error: err2 })
    }
    return {
      apiUrl: process.env.VITE_API_URL,
      session
    }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8"
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      {
        title: "kaja.io🚧α"
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png"
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png"
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png"
      },
      {
        rel: "manifest",
        href: "/site.webmanifest"
      },
      {
        name: "og:locale",
        content: "en_GB"
      },
      {
        name: "og:site_name",
        content: "Kaja.io"
      },
      {
        name: "og:url",
        content: "https://kaja.io"
      },
      {
        name: "twitter:title",
        content: "Kaja.io"
      },
      {
        name: "twitter:url",
        content: "https://x.com/SubZtep"
      }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      }
    ]
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: DefaultError
})

function RootDocument({ children }: Readonly<{ children: React.ReactNode }>) {
  const { apiUrl } = Route.useLoaderData()

  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />
        {process.env.VITE_UMAMI_WEBSITE_ID && (
          <script defer src="/u.js" data-website-id={process.env.VITE_UMAMI_WEBSITE_ID} data-host-url="/"></script>
        )}
      </head>
      <body>
        <Providers apiUrl={apiUrl}>{children}</Providers>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return <p className="text-center my-28 text-red-500 text-xl font-bold">Sorry, this page doesn't exist.</p>
}

function DefaultError({ error: err }: Readonly<{ error: Error }>) {
  useEffect(() => {
    error(err.message, { error: err })
  }, [err])

  return (
    <div className="flex flex-col items-center py-24">
      <ErrorComponent error={err} />
    </div>
  )
}
