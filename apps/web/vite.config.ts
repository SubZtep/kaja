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
  plugins: [
    devtools(),
    nitro({ preset: "bun" }),
    tailwindcss(),
    tanstackStart(),
    viteReact()
    //
  ]
})

export default config
