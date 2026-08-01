declare module "bun" {
  interface Env {
    /** Server-only (used by SSR / server functions). Optional; falls back to `VITE_API_URL`. */
    API_URL?: string
    /** API base URL. */
    VITE_API_URL: string
    /** This website’s URL. */
    VITE_APP_URL: string
    /** Umami Analytics ID */
    VITE_UMAMI_WEBSITE_ID?: string
  }
}
