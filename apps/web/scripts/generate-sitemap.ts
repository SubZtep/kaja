import { buildSitemap } from "../src/lib/seo-locales"

await Bun.write(new URL("../public/sitemap.xml", import.meta.url), buildSitemap())
