import { color } from "bun"
import { loadCredentials } from "./lib/auth/credentials"
import { deviceLogin } from "./lib/auth/device-login"

/**
 * API-only entry: talks to <apiUrl>/nasi/*, no local agent, no sqlite, no
 * MCP, no shell tools. `cli.ts` (full) must not be imported from this file —
 * that would pull @kaja/nasi's loop/store/tools into the lite bundle.
 */
const apiUrl = process.env.KAJA_API_URL ?? process.env.API_URL ?? "https://api.kaja.io"

async function resolveToken(): Promise<string> {
  const envToken = process.env.KAJA_TOKEN
  if (envToken) return envToken

  const stored = await loadCredentials()
  if (stored && stored.apiUrl === apiUrl) return stored.token

  console.log(`${color("cyan", "ansi")}Signing in to ${apiUrl}...`)
  return deviceLogin(apiUrl, prompt => {
    console.log(`\nGo to: ${color("cyan", "ansi")}${prompt.verificationUri}${color("reset", "ansi")}`)
    console.log(`Enter code: ${color("yellow", "ansi")}${prompt.userCode}${color("reset", "ansi")}\n`)
  })
}

try {
  const token = await resolveToken()

  const { runLiteApp } = await import("./subcommands/run-lite")
  await runLiteApp(apiUrl, token)
  console.log("Bye!")
  process.exit(0)
} catch (error) {
  const text = error instanceof Error ? error.message : String(error)
  console.log(`${color("red", "ansi")}${text}`)
  process.exit(1)
}
