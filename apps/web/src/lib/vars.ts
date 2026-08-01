import { createServerFn } from "@tanstack/react-start"

export const getApiUrl = createServerFn().handler(() => {
  return process.env.API_URL || process.env.VITE_API_URL
})

export const isWin32 = () => typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")

export const getInstallCmd = () =>
  isWin32() ? "irm https://kaja.io/setup.ps1 | iex" : "curl -fsSL https://kaja.io/setup.sh | bash"
