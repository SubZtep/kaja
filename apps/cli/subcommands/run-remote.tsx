import { color } from "bun"
import { render } from "ink"
import LiteApp from "../components/layout/lite-app"
import { loadToken, SecretsAccessError } from "../lib/auth/credentials"
import { deviceLogin } from "../lib/auth/device-login"
import { args } from "../lib/cli/args"
import { getCurrentUser, saveCurrentUser } from "../lib/config/config"
import { t } from "../lib/i18n"

/** Reset terminal colours */
const ANSI_RESET = "\x1b[0m"

async function resolveToken(apiUrl: string): Promise<string> {
  try {
    // Multiple accounts can be signed in on one machine (each keyed by email in the OS credential store,
    // see credentials.ts) — --user picks one explicitly, otherwise fall back to the last-used account.
    const targetEmail = args.flags.user ?? (await getCurrentUser())

    if (targetEmail) {
      const stored = await loadToken(targetEmail)
      if (stored) {
        await saveCurrentUser(targetEmail)
        return stored
      }
    }

    console.log(t("cli.pleaseSignIn"))

    const { email, token } = await deviceLogin(apiUrl, prompt => {
      console.log(
        `\n${color("lightgray", "ansi")}${t("cli.deviceLoginGoTo")} ${color("cyan", "ansi")}${prompt.verificationUri}`
      )
      console.log(
        `${color("lightgray", "ansi")}${t("cli.deviceLoginEnterCode")} ${color("yellow", "ansi")}${prompt.userCode}${ANSI_RESET}\n`
      )
    })
    await saveCurrentUser(email)
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
 * credentials for the current/selected user, or device login), then renders
 * LiteApp against hosted Nasi. No local agent, no sqlite, no MCP, no shell
 * tools — talks to `<apiUrl>/nasi/*` over SSE.
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
