import { KAJA_CLI_CLIENT_ID } from "@kaja/schema/api"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { saveToken } from "./credentials"

export type DeviceLoginPrompt = {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

export type DeviceLoginResult = {
  email: string
  token: string
}

/** Looks up the signed-in user's email for `token` via `/auth/get-session`, so the token can be stored per-account (see credentials.ts). */
async function fetchEmail(apiUrl: string, token: string): Promise<string> {
  const response = await fetch(new URL("/auth/get-session", apiUrl), {
    headers: { authorization: `Bearer ${token}` }
  })
  if (!response.ok) throw new Error("Failed to look up the signed-in user")
  const data = (await response.json()) as { user?: { email?: string } } | null
  const email = data?.user?.email
  if (!email) throw new Error("Failed to look up the signed-in user")
  return email
}

/**
 * Runs the OAuth device-authorization-grant flow against `apiUrl`: requests
 * a device code, hands the caller the code/URL to show the user (`onPrompt`),
 * then polls `/auth/device/token` until the user approves it in the browser.
 * On success, looks up the signed-in user's email and persists the bearer
 * token to the OS credential store under that email (see credentials.ts —
 * keyed by user, not apiUrl, so multiple accounts can coexist on one machine).
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
    client_id: KAJA_CLI_CLIENT_ID,
    scope: "openid profile email"
  })
  if (error || !data) {
    throw new Error(error?.error_description ?? "Failed to start device login")
  }

  onPrompt({
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete
  })

  let interval = data.interval ?? 5
  const deadline = Date.now() + 15 * 60 * 1000

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000))
    const poll = await authClient.device.token({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: data.device_code,
      client_id: KAJA_CLI_CLIENT_ID
    })
    if (poll.data?.access_token) {
      const token = poll.data.access_token
      const email = await fetchEmail(apiUrl, token)
      await saveToken(email, token)
      return { email, token }
    }
    switch (poll.error?.error) {
      case "authorization_pending":
        continue
      case "slow_down":
        interval += 5
        continue
      case "access_denied":
        throw new Error("Device login was denied")
      case "expired_token":
        throw new Error("Device login code expired — run login again")
      default:
        throw new Error(poll.error?.error_description ?? "Device login failed")
    }
  }
  throw new Error("Device login timed out")
}
