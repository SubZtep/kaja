import { paraglideVitePlugin } from "@inlang/paraglide-js"
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import { paraglideOptions } from "./paraglide.config.ts"

const config = defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  envPrefix: ["VITE_", "KAJA_"],
  build: {
    // Keep fonts out of the render-blocking stylesheet; they only download when a glyph needs them
    assetsInlineLimit: file => (/\.woff2?$/.test(file) ? false : undefined),
    rollupOptions: {
      output: {
        assetFileNames: assetInfo =>
          assetInfo.names?.some(name => name.endsWith(".css")) ? "assets/styles.css" : "assets/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    nitro({
      preset: "bun",
      routeRules: {
        "/assets/styles.css": { headers: { "cache-control": "public, max-age=3600, must-revalidate" } },
        "/art/**": { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } },
        "/monster.gif": { headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } }
      }
    }),
    tailwindcss(),
    paraglideVitePlugin(paraglideOptions),
    tanstackStart(),
    viteReact(),
    sentryTanstackStart({
      org: "kaja-io",
      project: "kaja-web",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      // Only error capture is used (no tracesSampleRate, no Replay), so strip the rest from the client bundle
      bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true,
        excludeReplayWorker: true
      }
    })
  ]
})

export default config
