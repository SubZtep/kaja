import { expect, test } from "bun:test"
import { buildSitemap, canonicalLocale, indexedLocales, localeUrl } from "../../src/lib/seo-locales"

test("en-US is not indexed: its canonical is en-GB", () => {
  expect(indexedLocales).not.toContain("en-US")
  expect(canonicalLocale("en-US")).toBe("en-GB")
  expect(canonicalLocale("de-DE")).toBe("de-DE")
})

test("the base locale is unprefixed, the others sit under their tag", () => {
  expect(localeUrl("/", "en-GB")).toBe("https://kaja.io/")
  expect(localeUrl("/", "de-DE")).toBe("https://kaja.io/de-DE/")
  expect(localeUrl("/signin", "en-GB")).toBe("https://kaja.io/signin")
  expect(localeUrl("/signin", "hu-HU")).toBe("https://kaja.io/hu-HU/signin")
})

test("public/sitemap.xml is what `bun run generate:sitemap` writes", async () => {
  const committed = await Bun.file(new URL("../../public/sitemap.xml", import.meta.url)).text()
  expect(committed).toBe(buildSitemap())
  expect(committed).not.toContain("en-US")
})
