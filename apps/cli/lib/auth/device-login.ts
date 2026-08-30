import { KAJA_CLI_CLIENT_ID } from "@kaja/schema/api"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { saveCredentials } from "./credentials"

export type DeviceLoginPrompt = {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

/**
 * Runs the OAuth device-authorization-grant flow against `apiUrl`: requests
 * a device code, hands the caller the code/URL to show the user (`onPrompt`),
 * then polls `/auth/device/token` until the user approves it in the browser.
 * On success, persists the bearer token to `credentials.json` and returns it.
 *
 * Rejects on `access_denied`, `expired_token`, or any other terminal error;
 * `authorization_pending` and `slow_down` are retried per the RFC 8628 poll
 * interval (increased by 5s on `slow_down`, per the spec).
 */
export async function deviceLogin(apiUrl: string, onPrompt: (prompt: DeviceLoginPrompt) => void): Promise<string> {
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
      await saveCredentials({ apiUrl, token })
      return token
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
