import { error } from "@kaja/logger"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, ErrorComponent, HeadContent, Scripts } from "@tanstack/react-router"
import { useEffect } from "react"
import { Providers } from "../components/Providers"
import { env } from "../env/server"
import { getSession } from "../lib/session"
import appCss from "../styles.css?url"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    let session: Awaited<ReturnType<typeof getSession>> | null = null
    try {
      session = await getSession()
    } catch (err) {
      error("Failed to fetch session in root loader", { error: err instanceof Error ? err.message : err })
    }
    return {
      apiUrl: env.VITE_API_URL,
      barkochbaWidgetKey: env.VITE_WIDGET_BARKOCHBA_KEY,
      chatWidgetKey: env.VITE_WIDGET_CHAT_KEY,
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
        title: "🕳 • Kaja"
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
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <HeadContent />

        <meta property="og:title" content="Kaja" />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://repository-images.githubusercontent.com/1171733366/7ff88fcc-f2fd-47f6-bfa6-a1888ab73b69"
        />
        <meta property="og:url" content="https://kaja.io" />

        <meta
          property="og:description"
          content="Open-source agentic harness. Keep looping your prompt with an LLM until the appropriate outcome is achieved."
        />
        <meta property="og:site_name" content="Kaja.io" />
        <meta property="og:locale" content="en_GB" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Kaja.io" />
        <meta
          name="twitter:description"
          content="Open-source agentic harness. Keep looping your prompt with an LLM until the appropriate outcome is achieved."
        />
        <meta
          name="twitter:image"
          content="https://repository-images.githubusercontent.com/1171733366/7ff88fcc-f2fd-47f6-bfa6-a1888ab73b69"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
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
