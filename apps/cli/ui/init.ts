import { log } from "@clack/prompts"
import { dimgrey, teal } from "../lib/colors"
import { deleteAccessToken } from "../lib/token"
import { version } from "../package.json"

declare const CLI_VERSION: string

export async function helperCommands() {
  const command = process.argv[2]?.toLowerCase()

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`Usage:  kaja <command>

Commands:
  version  Show version
  logout   Logout from Kaja
  help     Show help
`)
    return { handled: true, exitCode: 0 }
  }

  if (command === "version" || command === "--version" || command === "-v") {
    try {
      console.log(`v${CLI_VERSION}`)
    } catch {
      console.log(`v${version}`)
    }
    return { handled: true, exitCode: 0 }
  }

  if (command === "logout") {
    try {
      await deleteAccessToken()
      console.log("Logged out successfully")
      return { handled: true, exitCode: 0 }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[kaja] Logout failed: ${message}`)
      return { handled: true, exitCode: 1 }
    }
  }

  return { handled: false, exitCode: 0 }
}

export async function printLogo() {
  log.message(
    [`${teal}▖▖   ▘  ▄▖▄▖`, `${teal}▙▘▀▌ ▌▀▌▐ ▌▌`, `${teal}▌▌█▌ ▌█▌▟▖▙▌`, `${teal}    ▙▌${dimgrey}v${version}\n`].join(
      "\n"
    ),
    {
      withGuide: false
    }
  )
}
