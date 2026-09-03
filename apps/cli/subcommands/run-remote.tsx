import { color } from "bun"
import { render } from "ink"
import LiteApp from "../components/layout/lite-app"
import { loadCredentials } from "../lib/auth/credentials"
import { deviceLogin } from "../lib/auth/device-login"
import { t } from "../lib/i18n"

async function resolveToken(apiUrl: string): Promise<string> {
  const envToken = process.env.KAJA_TOKEN
  if (envToken) return envToken

  const stored = await loadCredentials()
  if (stored?.apiUrl === apiUrl) return stored.token

  console.log(t("cli.pleaseSignIn"))
  return deviceLogin(apiUrl, prompt => {
    console.log(`\n${t("cli.deviceLoginGoTo")} ${color("cyan", "ansi")}${prompt.verificationUri}`)
    console.log(
      `${color("white", "ansi")}${t("cli.deviceLoginEnterCode")} ${color("yellow", "ansi")}${prompt.userCode}${color("white", "ansi")}\n`
    )
  })
}

/**
 * Hosted path: reached via `--remote`, or by default when no local config
 * exists yet (see cli.ts's useLocal check). Resolves an API token (env,
 * cached credentials, or device login), then renders LiteApp against hosted
 * Nasi. No local agent, no sqlite, no MCP, no shell tools — talks to
 * `<apiUrl>/nasi/*` over SSE.
 */
export async function runRemoteSubcommand() {
  const apiUrl = process.env.KAJA_API_URL ?? "https://api.kaja.io"

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
