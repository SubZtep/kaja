import { color } from "bun"
import { runLogout } from "../lib/auth/logout"
import type { args as Cli } from "../lib/cli/args"

/** `kaja logout` — see lib/auth/logout.ts for the actual logic; testable there without exiting the process. */
export async function runLogoutSubcommand(cli: typeof Cli) {
  const { code, text } = await runLogout(cli.flags.user)
  console.log(code === 0 ? text : `${color("red", "ansi")}${text}`)
  process.exit(code)
}
