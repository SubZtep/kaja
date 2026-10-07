import silkscreenBold from "@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2?url"
import syneRegular from "@fontsource/syne/files/syne-latin-400-normal.woff2?url"
import syneExtraBold from "@fontsource/syne/files/syne-latin-800-normal.woff2?url"
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
import { captureError, loadSentry } from "../lib/sentry"
import { getSession } from "../lib/session"
import { getPageTitle, getRootEnv } from "../lib/vars"
import { m } from "../paraglide/messages.js"
import { baseLocale, getLocale, getTextDirection, type Locale, locales, localizeHref } from "../paraglide/runtime.js"
import appCss from "../styles.css?url"

// Bump `v` whenever public/og-image.png changes: X, Telegram and Facebook cache share images by URL
const OG_IMAGE = "https://kaja.io/og-image.png?v=2"

// The hero's fonts (headline, subline, stickers); preloaded so they don't wait for the stylesheet, which would shift the layout when they swap in
const PRELOAD_FONTS = [syneExtraBold, syneRegular, silkscreenBold]

const OG_LOCALE: Record<Locale, string> = {
  "en-GB": "en_GB",
  "en-US": "en_US",
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
      captureError(err)
      sessionError = true
    }
    // A signed-in user's saved language, before anything renders; in the browser LocaleSync does it (a full reload).
    const saved = session?.user.locale
    if (import.meta.env.SSR && saved && saved !== getLocale() && !keepsLinkLanguage(location.pathname))
      throw redirect({ href: localizeHref(location.href, { locale: saved }) })
    const { apiUrl, barkochbaWidgetKey, chatWidgetKey, turnstileSiteKey } = await getRootEnv()
    return {
      apiUrl,
      barkochbaWidgetKey,
      chatWidgetKey,
      turnstileSiteKey,
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
        ...PRELOAD_FONTS.map(href => ({
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href,
          crossOrigin: "anonymous" as const
        })),
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
  // The session, sandbox and widget requests all go to the API origin
  const apiUrl = Route.useLoaderData({ select: data => data.apiUrl })

  // Sentry starts right after hydration: off the first paint, yet early enough to catch what goes wrong next
  useEffect(() => {
    loadSentry().catch(() => {})
  }, [])

  return (
    // The Open Graph namespace (ogp.me); spread, since the RDFa `prefix` attribute isn't in every linter's list of HTML attributes
    <html lang={locale} dir={getTextDirection()} {...{ prefix: "og: https://ogp.me/ns#" }} suppressHydrationWarning>
      <head>
        {apiUrl && <link rel="preconnect" href={apiUrl} />}
        <HeadContent />

        <meta property="og:type" content="website" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={m.site_og_image_alt()} />
        <meta property="og:site_name" content="Kaja" />
        <meta property="og:locale" content={ogLocale} />
        {locales
          .filter(other => other !== locale)
          .map(other => (
            <meta key={other} property="og:locale:alternate" content={OG_LOCALE[other]} />
          ))}

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content={m.site_og_image_alt()} />
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
  return <p className="my-28 text-center font-bold text-red-500 text-xl">{m.not_found_message()}</p>
}

function DefaultError({ error: err }: ErrorComponentProps) {
  useEffect(() => {
    captureError(err)
  }, [err])

  return (
    <div className="flex flex-col items-center py-24">
      <ErrorComponent error={err} />
    </div>
  )
}
