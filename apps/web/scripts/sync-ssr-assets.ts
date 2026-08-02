import { copyFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const OUTPUT_ASSETS = join(import.meta.dir, "..", ".output", "public", "assets")
const SSR_ASSETS = join(import.meta.dir, "..", "node_modules", ".nitro", "vite", "services", "ssr", "assets")

if (!existsSync(SSR_ASSETS) || !existsSync(OUTPUT_ASSETS)) {
  process.exit(0)
}

const outputFiles = new Set(readdirSync(OUTPUT_ASSETS))

for (const file of readdirSync(SSR_ASSETS)) {
  if (!file.endsWith(".css")) continue
  if (outputFiles.has(file)) continue
  copyFileSync(join(SSR_ASSETS, file), join(OUTPUT_ASSETS, file))
  console.log(`sync-ssr-assets: copied missing ${file} into .output/public/assets`)
}
