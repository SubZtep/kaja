import { consolePalette, paint } from "../components/theme"
import { getApiBaseUrl } from "../lib/config/api-url"
import { t } from "../lib/i18n"

/** `kaja login`: signs in to Kaja cloud without starting a chat, e.g. for `--local` abilities that run on a sandbox. */
export async function runLoginSubcommand() {
  const { resolveConsoleTheme } = await import("../lib/terminal-background")
  await resolveConsoleTheme()
  const palette = consolePalette()
  try {
    const { resolveToken } = await import("./run-cloud")
    // A stored token the API still takes needs no sign-in; an expired one is cleared and signed in again
    let already = false
    await resolveToken(getApiBaseUrl(), {
      onStored: () => {
        already = true
      }
    })
    console.log(already ? t("cli.loginAlready") : paint(palette.success)(t("cli.loginDone")))
  } catch (error) {
    console.log(paint(palette.danger)(error instanceof Error ? error.message : String(error)))
    process.exit(1)
  }
}
