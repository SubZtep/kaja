import { createServerFn } from "@tanstack/react-start"
import { env } from "../env/server"

export const getRootEnv = createServerFn().handler(() => {
  return {
    apiUrl: env.VITE_API_URL,
    barkochbaReady: Boolean(env.BARKOCHBA_BOARD_TOKEN && env.BARKOCHBA_PLAYER_TOKEN),
    turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY
  }
})

let browserRootEnv: ReturnType<typeof getRootEnv> | undefined

/** {@link getRootEnv}, asked once per page in the browser since it never changes there. */
export function loadRootEnv(): ReturnType<typeof getRootEnv> {
  if (import.meta.env.SSR) return getRootEnv()
  browserRootEnv ??= getRootEnv()
  browserRootEnv.catch(() => (browserRootEnv = undefined))
  return browserRootEnv
}

const isWin32 = () => typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")

/** One-line CLI installers, by platform. */
export const INSTALL_CMD = {
  unix: "curl -fsSL https://kaja.io/install.sh | bash",
  windows: "irm https://kaja.io/install.ps1 | iex"
} as const

export type InstallOs = keyof typeof INSTALL_CMD

/** The visitor's installer platform (client only; the server always gets `unix`). */
export const detectInstallOs = (): InstallOs => (isWin32() ? "windows" : "unix")

export function getPageTitle(title?: string) {
  return title ? `${title} • Kaja` : "Kaja"
}
