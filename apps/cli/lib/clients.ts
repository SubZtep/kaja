import { resolveApiUrl } from "./config"
import { KajaClient } from "./kaja-sdk"
import { OllamaCliClient } from "./ollama-cli"

declare module "bun" {
  interface Env {
    /** API base URL without trailing slash */
    API_URL: string
  }
}

export const apiBaseUrl = resolveApiUrl()

// singletons
export const kaja = new KajaClient({ baseURL: apiBaseUrl })
export const ollama = new OllamaCliClient()
