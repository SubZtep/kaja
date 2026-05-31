import { error, trace } from "@kaja/logger"
import { version } from "../package.json"
import { apiBaseUrl } from "./lib/clients"
import { deleteConfig } from "./lib/local-store"
import { deleteAccessToken } from "./lib/token"

declare const CLI_VERSION: string

// Set API URL
process.env.API_URL = apiBaseUrl

/** Process and resolve command-line arguments. */
export function handleArgs() {
  // Handle helper commands before rendering
  const command = process.argv[2]?.toLowerCase()

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`Usage:  kaja <command>

Commands:
  version  Show version
  logout   Logout from Kaja
  help     Show help ♡
`)
    process.exit(0)
  }

  if (command === "version" || command === "--version" || command === "-v") {
    try {
      console.log(`v${CLI_VERSION}`)
    } catch {
      console.log(`v${version}`)
    }
    process.exit(0)
  }

  if (command === "logout") {
    deleteAccessToken()
      .then(() => {
        trace("Logged out successfully")
        return deleteConfig()
      })
      .then(() => {
        trace("Config deleted successfully")
        process.exit(0)
      })
      .catch(err => {
        error("Failed to logout", { error: err })
        process.exit(1)
      })
  }
}
