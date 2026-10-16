import { consolePalette, paint } from "../components/theme"
import { loadToken } from "../lib/auth/credentials"
import { getApiBaseUrl } from "../lib/config/api-url"
import { t } from "../lib/i18n"

/** `kaja login`: signs in to Kaja cloud without starting a chat, e.g. for `--local` abilities that run on a sandbox. */
export async function runLoginSubcommand() {
  const { resolveConsoleTheme } = await import("../lib/terminal-background")
  await resolveConsoleTheme()
  const palette = consolePalette()
  try {
    if (await loadToken()) {
      console.log(t("cli.loginAlready"))
      return
    }
    const { resolveToken } = await import("./run-cloud")
    await resolveToken(getApiBaseUrl())
    console.log(paint(palette.success)(t("cli.loginDone")))
  } catch (error) {
    console.log(paint(palette.danger)(error instanceof Error ? error.message : String(error)))
    process.exit(1)
  }
}
