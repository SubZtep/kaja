import * as Sentry from "@sentry/tanstackstart-react"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  ErrorComponent,
  type ErrorComponentProps,
  HeadContent,
  redirect,
  Scripts
} from "@tanstack/react-router"
import { useEffect } from "react"
import { keepsLinkLanguage, LocaleSync } from "../components/LocaleSync"
import { Providers } from "../components/Providers"
import { getSession } from "../lib/session"
import { getPageTitle, getRootEnv } from "../lib/vars"
import { m } from "../paraglide/messages.js"
import { baseLocale, getLocale, getTextDirection, type Locale, locales, localizeHref } from "../paraglide/runtime.js"
import appCss from "../styles.css?url"

const OG_IMAGE = "https://kaja.io/og-image.png"

const OG_LOCALE: Record<Locale, string> = {
  "en-GB": "en_GB",
  "hu-HU": "hu_HU",
  "nan-TW": "nan_TW",
  "zh-TW": "zh_TW"
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ location }) => {
    let session: Awaited<ReturnType<typeof getSession>> | null = null
    let sessionError = false
    try {
      session = await getSession()
    } catch (err) {
      Sentry.captureException(err)
      sessionError = true
    }
    // A signed-in user's saved language, before anything renders; in the browser LocaleSync does it (a full reload).
    const saved = session?.user.locale
    if (import.meta.env.SSR && saved && saved !== getLocale() && !keepsLinkLanguage(location.pathname))
      throw redirect({ href: localizeHref(location.href, { locale: saved }) })
    const { apiUrl, barkochbaWidgetKey, chatWidgetKey } = await getRootEnv()
    return {
      apiUrl,
      barkochbaWidgetKey,
      chatWidgetKey,
      session,
      sessionError
    }
  },
  head: ({ matches }) => {
    // The root match's pathname is always "/"; the leaf holds the page's (de-localized) path, index routes end in "/" so strip it (bar the root) to match the sitemap
    let pathname = matches.at(-1)?.pathname ?? "/"
    while (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1)
    return {
      meta: [
        {
          charSet: "utf-8"
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1"
        },
        {
          title: getPageTitle()
        },
        {
          name: "theme-color",
          content: "#9aa88f"
        },
        {
          property: "og:url",
          content: `https://kaja.io${localizeHref(pathname)}`
        }
      ],
      links: [
        {
          rel: "canonical",
          href: `https://kaja.io${localizeHref(pathname)}`
        },
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
        {
          rel: "alternate",
          type: "text/markdown",
          title: "LLM-friendly version",
          href: "/llms.txt"
        },
        ...locales.map(locale => ({
          rel: "alternate",
          hrefLang: locale,
          href: `https://kaja.io${localizeHref(pathname, { locale })}`
        })),
        {
          rel: "alternate",
          hrefLang: "x-default",
          href: `https://kaja.io${localizeHref(pathname, { locale: baseLocale })}`
        }
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Kaja",
            url: "https://kaja.io",
            publisher: {
              "@type": "Organization",
              name: "Kaja",
              url: "https://kaja.io",
              logo: "https://kaja.io/android-chrome-512x512.png",
              sameAs: ["https://github.com/SubZtep/kaja", "https://x.com/SubZtep"]
            }
          })
        }
      ]
    }
  },
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
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1280" />
        <meta property="og:image:height" content="640" />
        <meta property="og:site_name" content="Kaja.io" />
        <meta property="og:locale" content={ogLocale} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={OG_IMAGE} />
      </head>
      <body>
        <Providers>
          {children}
          <LocaleSync />
        </Providers>
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
    Sentry.captureException(err)
  }, [err])

  return (
    <div className="flex flex-col items-center py-24">
      <ErrorComponent error={err} />
    </div>
  )
}
