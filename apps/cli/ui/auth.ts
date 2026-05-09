import { cancel, intro, log, note, outro } from "@clack/prompts"
import { KAJA_CLI_CLIENT_ID } from "@kaja/schemas"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import clipboard from "clipboardy"
import qrcode from "qrcode-terminal"
import { apiBaseUrl, kaja } from "../lib/clients"
import { cyan } from "../lib/colors"
import { getAccessToken, setAccessToken, setSessionAccessToken } from "../lib/token"

function createDeviceAuthClient() {
  return createAuthClient({
    baseURL: apiBaseUrl,
    basePath: "/auth",
    plugins: [deviceAuthorizationClient()]
  })
}

function fail(message: string) {
  cancel(message)
  throw new Error(message)
}

export async function authFlow() {
  if (!(await kaja.ping())) {
    throw new Error(`Unable to connect to ${kaja.host()}`)
  }

  const authClient = createDeviceAuthClient()
  const storedToken = await getAccessToken()
  const { data: oldSession } = await authClient.getSession(
    storedToken ? { fetchOptions: { headers: { Authorization: `Bearer ${storedToken}` } } } : {}
  )
  if (oldSession?.user) {
    // user is already logged in
    return
  }

  intro("Authentication")

  const { data, error } = await authClient.device.code({
    client_id: KAJA_CLI_CLIENT_ID
  })
  if (error || !data) {
    fail(error?.error_description ?? error?.statusText ?? "Could not start device login")
  }

  const { device_code, user_code, verification_uri, verification_uri_complete, interval = 5, expires_in = 1800 } = data

  // MARK: Authentication

  if (verification_uri_complete) {
    log.message(`Login link: ${verification_uri_complete}`)
  } else if (verification_uri) {
    log.message(`Login link: ${verification_uri}`)
    log.message(`User code: ${user_code}`)
  } else {
    fail("No login link found")
  }

  const link = verification_uri_complete ?? verification_uri
  const cleanupLoginActions = listenForLoginActions(link)
  let token: string

  try {
    token = await pollDeviceToken(authClient, device_code, interval, Date.now() + expires_in * 1000)
  } finally {
    cleanupLoginActions()
  }

  try {
    await setAccessToken(token)
  } catch (err) {
    setSessionAccessToken(token)
    log.error(
      `Could not save the token to the system secret store (${err instanceof Error ? err.message : String(err)}). You stay signed in for this CLI run only — next time, fix the store or sign in again.`
    )
  }

  const { data: session } = await authClient.getSession({
    fetchOptions: {
      headers: { Authorization: `Bearer ${token}` }
    }
  })

  note(`${cyan}Welcome aboard, ${session?.user?.name ?? session?.user?.email ?? "user"}!`, "👋")
  outro("Authentication successful")
}

function listenForLoginActions(link: string) {
  const stdin = process.stdin
  const canReadKeys = stdin.isTTY && typeof stdin.setRawMode === "function"

  if (!canReadKeys) {
    log.message("Waiting for browser approval...")
    return () => {}
  }

  const wasRaw = stdin.isRaw
  const wasPaused = stdin.isPaused()
  let cleanedUp = false

  const cleanup = () => {
    if (cleanedUp) {
      return
    }

    cleanedUp = true
    stdin.off("data", onData)
    stdin.setRawMode(wasRaw)

    if (wasPaused) {
      stdin.pause()
    }
  }

  const onData = (data: Buffer) => {
    const input = data.toString("utf8").toLowerCase()

    for (const key of input) {
      switch (key) {
        case "\u0003":
          cleanup()
          fail("Authentication cancelled")
        case "o":
          openLoginLink(link)
          break
        case "q":
          qrcode.generate(link, { small: true })
          break
        case "c":
          copyLoginLink(link)
          break
      }
    }
  }

  log.message("Waiting for approval... Press o to open, c to copy, q for QR, or Ctrl+C to cancel.")
  stdin.setRawMode(true)
  stdin.resume()
  stdin.on("data", onData)

  return cleanup
}

async function openLoginLink(link: string) {
  try {
    const { default: open } = await import("open")
    await open(link)
  } catch {
    log.error("Could not open a browser. Please open the link manually, then approve the login.")
  }
}

async function copyLoginLink(link: string) {
  try {
    await clipboard.write(link)
    log.success("Link copied to clipboard. Paste it into your browser, then approve the login.")
  } catch {
    log.error("Could not copy to clipboard. Please paste the link manually into your browser, then approve the login.")
  }
}

async function pollDeviceToken(
  authClient: ReturnType<typeof createDeviceAuthClient>,
  deviceCode: string,
  intervalSec: number,
  deadlineMs: number
) {
  const grant_type = "urn:ietf:params:oauth:grant-type:device_code"
  let waitMs = Math.max(intervalSec, 1) * 1000

  while (Date.now() < deadlineMs) {
    await Bun.sleep(waitMs)
    const { data, error } = await authClient.device.token({
      grant_type,
      device_code: deviceCode,
      client_id: KAJA_CLI_CLIENT_ID
    })
    if (data?.access_token) {
      return data.access_token
    }
    switch (error?.error) {
      case "authorization_pending":
        continue
      case "slow_down":
        waitMs += 5000
        continue
      case "access_denied":
        fail("Access denied")
      case "expired_token":
        fail("Device code expired — run again")
      default:
        fail(error?.error ?? "Device token error")
    }
  }

  fail("Device authorization timed out")
}
