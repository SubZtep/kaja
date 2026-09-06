import { createServerFn } from "@tanstack/react-start"
import { env } from "../env/server"

export const getApiUrl = createServerFn().handler(() => {
  return env.API_URL || env.VITE_API_URL
})

export const isWin32 = () => typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")

export const getInstallCmd = () =>
  isWin32() ? "irm https://kaja.io/install.ps1 | iex" : "curl -fsSL https://kaja.io/install.sh | bash"

export function getPageTitle(title?: string) {
  return title ? `${title} • Kaja` : "Kaja"
}
