import { createNasiClient } from "@kaja/nasi/client"
import { color } from "bun"

/**
 * API-only CLI: talks to api.kaja.io/nasi, no local agent.
 * Device login lands in a later slice; for now KAJA_TOKEN + KAJA_API_URL.
 */
const apiUrl = process.env.KAJA_API_URL ?? process.env.API_URL ?? "https://api.kaja.io"
const token = process.env.KAJA_TOKEN

if (!token) {
  console.log(
    `${color("yellow", "ansi")}kaja-lite needs a kaja.io session token.\nSet KAJA_TOKEN (and optionally KAJA_API_URL). Device login is not wired in this build yet.`
  )
  process.exit(1)
}

const message = process.argv.slice(2).join(" ").trim()
if (!message) {
  console.log("usage: kaja-lite <message>")
  process.exit(1)
}

const client = createNasiClient({
  baseUrl: apiUrl,
  getToken: async () => token
})

try {
  const result = await client.turn({ message })
  console.log(result.message)
} catch (error) {
  const text = error instanceof Error ? error.message : String(error)
  console.log(`${color("red", "ansi")}${text}`)
  process.exit(1)
}
