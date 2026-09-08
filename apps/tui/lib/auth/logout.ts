import { t } from "../i18n"
import { clearToken, loadToken, SecretsAccessError } from "./credentials"

/**
 * Clears the hosted (--remote) token from the OS credential store. Returns
 * the text to print and the exit code instead of printing/exiting itself, so
 * tests can call it directly.
 */
export async function runLogout(): Promise<{ code: number; text: string }> {
  try {
    const hadToken = (await loadToken()) !== undefined
    await clearToken()
    return { code: 0, text: t(hadToken ? "cli.logoutSuccess" : "cli.logoutNotSignedIn") }
  } catch (error) {
    if (error instanceof SecretsAccessError) return { code: 1, text: t("cli.secretsUnavailable") }
    throw error
  }
}
