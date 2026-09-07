import { error } from "@kaja/logger"
import * as Sentry from "@sentry/tanstackstart-react"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  ErrorComponent,
  type ErrorComponentProps,
  HeadContent,
  Scripts
} from "@tanstack/react-router"
import { useEffect } from "react"
import { Providers } from "../components/Providers"
import { getSession } from "../lib/session"
import { getRootEnv } from "../lib/vars"
import { m } from "../paraglide/messages.js"
import { baseLocale, getLocale, getTextDirection, type Locale, locales, localizeHref } from "../paraglide/runtime.js"
import appCss from "../styles.css?url"

const OG_LOCALE: Record<Locale, string> = {
  "en-GB": "en_GB",
  hu: "hu_HU",
  "nan-TW": "nan_TW"
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async () => {
    let session: Awaited<ReturnType<typeof getSession>> | null = null
    try {
      session = await getSession()
    } catch (err) {
      error("Failed to fetch session in root loader", { error: err instanceof Error ? err.message : err })
    }
    const { apiUrl, barkochbaWidgetKey, chatWidgetKey } = await getRootEnv()
    return {
      apiUrl,
      barkochbaWidgetKey,
      chatWidgetKey,
      session
    }
  },
  head: ({ match }) => ({
    meta: [
      {
        charSet: "utf-8"
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      {
        title: m.site_title()
      }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
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
      ...locales.map(locale => ({
        rel: "alternate",
        hrefLang: locale,
        href: `https://kaja.io${localizeHref(match.pathname, { locale })}`
      })),
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: `https://kaja.io${localizeHref(match.pathname, { locale: baseLocale })}`
      }
    ]
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: DefaultError
})

function RootDocument({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = getLocale()
  const ogLocale = OG_LOCALE[locale]

  return (
    <html lang={locale} dir={getTextDirection()} suppressHydrationWarning>
      <head>
        <HeadContent />

        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://repository-images.githubusercontent.com/1171733366/7ff88fcc-f2fd-47f6-bfa6-a1888ab73b69"
        />
        <meta property="og:url" content="https://kaja.io" />
        <meta property="og:site_name" content="Kaja.io" />
        <meta property="og:locale" content={ogLocale} />

        <meta name="twitter:card" content="summary_large_image" />
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
  return <p className="text-center my-28 text-red-500 text-xl font-bold">{m.not_found_message()}</p>
}

function DefaultError({ error: err }: ErrorComponentProps) {
  useEffect(() => {
    error(err instanceof Error ? err.message : String(err), { error: err })
    Sentry.captureException(err)
  }, [err])

  return (
    <div className="flex flex-col items-center py-24">
      <ErrorComponent error={err} />
    </div>
  )
}
