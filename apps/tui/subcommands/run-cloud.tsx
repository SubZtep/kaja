import { setToolDeps } from "@kaja/nasi"
import { formatDeviceUserCode } from "@kaja/shared"
import { color } from "bun"
import { render } from "ink"
import notifier from "node-notifier"
import open from "open"
import { writeText } from "tinyclip"
import App from "../components/layout/app"
import { loadToken, SecretsAccessError } from "../lib/auth/credentials"
import { deviceLogin } from "../lib/auth/device-login"
import { getApiBaseUrl } from "../lib/config/api-url"
import { config } from "../lib/config/config"
import { getLanguage, t } from "../lib/i18n"
import { log } from "../lib/logger"

/** Reset terminal colours */
const ANSI_RESET = "\x1b[0m"

async function resolveToken(apiUrl: string): Promise<string> {
  try {
    const stored = await loadToken()
    if (stored) return stored

    console.log(t("cli.pleaseSignIn"))

    const { token } = await deviceLogin(apiUrl, async prompt => {
      const code = formatDeviceUserCode(prompt.userCode)
      await writeText(code)
      notifier.notify({ title: "Kaja", message: t("cli.deviceLoginCodeCopied") }, error => {
        if (error) log.warn("Device login notification failed", { error })
      })

      console.log(
        `\n${color("lightgray", "ansi")}${t("cli.deviceLoginGoTo")} ${color("cyan", "ansi")}${prompt.verificationUri}`
      )
      console.log(
        `${color("lightgray", "ansi")}${t("cli.deviceLoginEnterCode")} ${color("yellow", "ansi")}${code}${ANSI_RESET}\n`
      )

      const url = prompt.verificationUriComplete ?? prompt.verificationUri
      open(url).catch(error => log.warn("Failed to open browser for device login", { error }))
    })
    const { saveAccountLocale } = await import("../lib/auth/account-locale")
    await saveAccountLocale(getLanguage())
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
 * Cloud path: reached via `--cloud`, or by default when no local config
 * exists yet (see cli.ts's useLocal check). Resolves an API token (stored
 * credentials, or device login), then renders App in cloud mode, against
 * cloud Nasi. No local agent, no sqlite, no MCP, no shell tools — talks to
 * `<apiUrl>/nasi/*` over SSE.
 */
export async function runCloudSubcommand() {
  const apiUrl = getApiBaseUrl()

  try {
    const token = await resolveToken(apiUrl)
    // cli.ts guarantees settings.toml exists (via createCloud()) before this subcommand runs.
    const { preferences } = await config()
    // Scopes read_file/list_files (run client-side when the server hands them back via a client_tool_call pause) to the same directory local mode defaults to.
    setToolDeps({ workspaceRoot: process.cwd() })

    const { waitUntilExit } = render(
      <App mode="cloud" initialPreferences={preferences} apiUrl={apiUrl} token={token} />,
      {
        alternateScreen: true,
        kittyKeyboard: {
          mode: "auto",
          flags: ["disambiguateEscapeCodes"]
        }
      }
    )
    await waitUntilExit()
    console.log(t("cli.bye"))
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    console.log(`${color("red", "ansi")}${text}`)
    process.exit(1)
  }
}
