import { consolePalette, paint } from "../components/theme"
import { runLogout } from "../lib/auth/logout"

/** `kaja logout` — see lib/auth/logout.ts for the actual logic; testable there without exiting the process. */
export async function runLogoutSubcommand() {
  const { code, text } = await runLogout()
  console.log(code === 0 ? text : paint(consolePalette().danger)(text))
  process.exit(code)
}
