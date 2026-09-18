import type { CompilerOptions } from "@inlang/paraglide-js"

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
      localized: [
        ["hu", "/hu/:path(.*)?"],
        ["nan-TW", "/nan-TW/:path(.*)?"],
        ["en-GB", "/:path(.*)?"]
      ]
    }
  ]
}
