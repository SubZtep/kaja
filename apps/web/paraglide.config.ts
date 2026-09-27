import type { CompilerOptions } from "@inlang/paraglide-js"
import { baseLocale, locales } from "@kaja/shared/locale"

/** Shared between `vite.config.ts` (dev/build) and `scripts/generate-paraglide.ts` (CI/standalone regeneration) so both produce identical output. */
export const paraglideOptions: CompilerOptions = {
  project: "./project.inlang",
  outdir: "./src/paraglide",
  emitTsDeclarations: true,
  strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
  cookieName: "locale",
  urlPatterns: [
    {
      pattern: "/:path(.*)?",
      // Every other locale under its own prefix; en-GB, unprefixed, last as the catch-all
      localized: [
        ...locales
          .filter(locale => locale !== baseLocale)
          .map((locale): [string, string] => [locale, `/${locale}/:path(.*)?`]),
        [baseLocale, "/:path(.*)?"]
      ]
    }
  ]
}
