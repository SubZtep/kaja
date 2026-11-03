import { baseLocale, type Locale, locales } from "@kaja/shared/locale"

const SITE = "https://kaja.io"

/**
 * En-US differs from en-GB by a handful of spellings; Google reads that as a duplicate, so it points its canonical at
 * en-GB.
 */
const CANONICAL_LOCALE: Partial<Record<Locale, Locale>> = { "en-US": baseLocale }

/** The locales worth indexing: those whose pages are not a near-copy of another one. */
export const indexedLocales = locales.filter(locale => !(locale in CANONICAL_LOCALE))

/** The locale whose URL a page in `locale` names as its canonical and, in the sitemap, lists. */
export const canonicalLocale = (locale: Locale): Locale => CANONICAL_LOCALE[locale] ?? locale

/** Absolute URL of a de-localized `path` ("/", "/signin") in `locale`; the base locale is unprefixed. */
export function localeUrl(path: string, locale: Locale) {
  const prefix = locale === baseLocale ? "" : `/${locale}`
  return path === "/" ? `${SITE}${prefix}/` : `${SITE}${prefix}${path}`
}

/** The sitemap: each indexed page in each indexed locale, with the full hreflang set on every entry. */
export function buildSitemap(paths: readonly string[] = ["/"]) {
  const entries = paths.flatMap(path => {
    const alternates = [
      ...indexedLocales.map(
        locale => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${localeUrl(path, locale)}"/>`
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${localeUrl(path, baseLocale)}"/>`
    ].join("\n")
    return indexedLocales.map(locale => `  <url>\n    <loc>${localeUrl(path, locale)}</loc>\n${alternates}\n  </url>`)
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`
}
