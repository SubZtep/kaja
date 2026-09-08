import { clearCurrentUser, getCurrentUser } from "../config/config"
import { t } from "../i18n"
import { clearToken, loadToken, SecretsAccessError } from "./credentials"

/**
 * Clears the hosted (--remote) token from the OS credential store for
 * `userFlag` or the saved current user, and forgets it as the saved current
 * user so the next `--remote` run falls back to device login. Returns the
 * text to print and the exit code instead of printing/exiting itself, so
 * tests can call it directly.
 */
export async function runLogout(userFlag: string | undefined): Promise<{ code: number; text: string }> {
  const email = userFlag ?? (await getCurrentUser())
  if (!email) return { code: 1, text: t("cli.logoutNoUser") }

  try {
    const hadToken = (await loadToken(email)) !== undefined
    await clearToken(email)
    if (email === (await getCurrentUser())) await clearCurrentUser()
    return { code: 0, text: t(hadToken ? "cli.logoutSuccess" : "cli.logoutNotSignedIn", { email }) }
  } catch (error) {
    if (error instanceof SecretsAccessError) return { code: 1, text: t("cli.secretsUnavailable") }
    throw error
  }
}
