import { KAJA_TUI_CLIENT_ID } from "@kaja/schema/api"
import { type Locale, locales } from "@kaja/shared"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { getLanguage, t } from "../i18n"
import { saveToken } from "./credentials"

export type DeviceLoginPrompt = {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

export type DeviceLoginResult = {
  token: string
}

/** The web page in the terminal's language: the web reads an unprefixed path as en-GB, so any other language goes in front of it (`/hu-HU/device`). A signed-in visitor's page then switches to their account's language on its own. */
export function localizeWebUrl(url: string, locale: Locale): string {
  const parsed = new URL(url)
  const [, first = ""] = parsed.pathname.split("/")
  if (locale === "en-GB" || (locales as readonly string[]).includes(first)) return url
  parsed.pathname = `/${locale}${parsed.pathname}`
  return parsed.toString()
}

/**
 * Runs the OAuth device-authorization-grant flow against `apiUrl`: requests
 * a device code, hands the caller the code/URL to show the user (`onPrompt`),
 * then polls `/auth/device/token` until the user approves it in the browser.
 * On success, persists the bearer token to the OS credential store (see
 * credentials.ts).
 *
 * Rejects on `access_denied`, `expired_token`, or any other terminal error;
 * `authorization_pending` and `slow_down` are retried per the RFC 8628 poll
 * interval (increased by 5s on `slow_down`, per the spec).
 */
export async function deviceLogin(
  apiUrl: string,
  onPrompt: (prompt: DeviceLoginPrompt) => void
): Promise<DeviceLoginResult> {
  const authClient = createAuthClient({
    baseURL: apiUrl,
    basePath: "/auth",
    plugins: [deviceAuthorizationClient()]
  })

  const { data, error } = await authClient.device.code({
    client_id: KAJA_TUI_CLIENT_ID,
    scope: "openid profile email"
  })
  if (error || !data) {
    throw new Error(error?.error_description ?? t("cli.deviceLoginStartFailed"))
  }

  const locale = getLanguage()
  onPrompt({
    userCode: data.user_code,
    verificationUri: localizeWebUrl(data.verification_uri, locale),
    verificationUriComplete: data.verification_uri_complete && localizeWebUrl(data.verification_uri_complete, locale)
  })

  let interval = data.interval ?? 5
  const deadline = Date.now() + 15 * 60 * 1000

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000))
    const poll = await authClient.device.token({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: data.device_code,
      client_id: KAJA_TUI_CLIENT_ID
    })
    if (poll.data?.access_token) {
      const token = poll.data.access_token
      await saveToken(token)
      return { token }
    }
    switch (poll.error?.error) {
      case "authorization_pending":
        continue
      case "slow_down":
        interval += 5
        continue
      case "access_denied":
        throw new Error(t("cli.deviceLoginDenied"))
      case "expired_token":
        throw new Error(t("cli.deviceLoginExpired"))
      default:
        throw new Error(poll.error?.error_description ?? t("cli.deviceLoginFailed"))
    }
  }
  throw new Error(t("cli.deviceLoginTimedOut"))
}
