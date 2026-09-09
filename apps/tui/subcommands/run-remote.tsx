import { color } from "bun"
import { render } from "ink"
import notifier from "node-notifier"
import { writeText } from "tinyclip"
import LiteApp from "../components/layout/lite-app"
import { loadToken, SecretsAccessError } from "../lib/auth/credentials"
import { deviceLogin } from "../lib/auth/device-login"
import { getApiBaseUrl } from "../lib/config/services"
import { t } from "../lib/i18n"
import { log } from "../lib/logger"

/** Reset terminal colours */
const ANSI_RESET = "\x1b[0m"

async function resolveToken(apiUrl: string): Promise<string> {
  try {
    const stored = await loadToken()
    if (stored) return stored

    console.log(t("cli.pleaseSignIn"))

    const { token } = await deviceLogin(apiUrl, async prompt => {
      const code = `${prompt.userCode.slice(0, 4)}-${prompt.userCode.slice(4)}`
      await writeText(code)
      notifier.notify({ title: "Kaja", message: t("cli.deviceLoginCodeCopied") }, error => {
        // TODO: validate that notify worked
        if (error) log.warn("Device login notification failed", { error })
      })

      console.log(
        `\n${color("lightgray", "ansi")}${t("cli.deviceLoginGoTo")} ${color("cyan", "ansi")}${prompt.verificationUri}`
      )
      console.log(
        `${color("lightgray", "ansi")}${t("cli.deviceLoginEnterCode")} ${color("yellow", "ansi")}${code}${ANSI_RESET}\n`
      )
    })
    return token
  } catch (error) {
    if (error instanceof SecretsAccessError) {
      const reason = error.cause instanceof Error ? error.cause.message : String(error.cause)
      throw new Error(`${t("cli.secretsUnavailable")} (${reason})`)
    }
    throw error
  }
}

/**
 * Hosted path: reached via `--remote`, or by default when no local config
 * exists yet (see cli.ts's useLocal check). Resolves an API token (stored
 * credentials, or device login), then renders LiteApp against hosted Nasi.
 * No local agent, no sqlite, no MCP, no shell tools — talks to
 * `<apiUrl>/nasi/*` over SSE.
 */
export async function runRemoteSubcommand() {
  const apiUrl = await getApiBaseUrl()

  try {
    const token = await resolveToken(apiUrl)

    const { waitUntilExit } = render(<LiteApp apiUrl={apiUrl} token={token} />, {
      alternateScreen: true,
      kittyKeyboard: {
        mode: "auto",
        flags: ["disambiguateEscapeCodes"]
      }
    })
    await waitUntilExit()
    console.log(t("cli.bye"))
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    console.log(`${color("red", "ansi")}${text}`)
    process.exit(1)
  }
}
