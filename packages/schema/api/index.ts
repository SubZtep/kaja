export * from "./ability"
export * from "./auth"
export * from "./config-export"
export * from "./model"
export * from "./sandbox"
export * from "./stats"
export * from "./telegram-link"
export * from "./widget-key"

export const KAJA_TUI_CLIENT_ID = "kaja-tui"

/** Header carrying the web server's shared `SSR_SECRET`, proving the request comes from the web's SSR. */
export const SSR_SECRET_HEADER = "x-kaja-ssr-secret"

/** Header carrying the visitor's IP on an SSR request; the API trusts it only alongside a valid `SSR_SECRET_HEADER`. */
export const SSR_CLIENT_IP_HEADER = "x-kaja-client-ip"
