import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
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
    devtools(),
    nitro({
      preset: "bun",
      routeRules: {
        "/assets/styles.css": { headers: { "cache-control": "public, max-age=3600, must-revalidate" } }
      }
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact()
    //
  ]
})

export default config
