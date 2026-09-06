import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  envPrefix: ["VITE_", "KAJA_"],
  build: {
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
        "/assets/styles.css": { headers: { "cache-control": "public, max-age=3600, must-revalidate" } }
      }
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    sentryTanstackStart({
      org: "kaja-io",
      project: "kaja-web",
      authToken: process.env.SENTRY_AUTH_TOKEN
    })
    //
  ]
})

export default config
