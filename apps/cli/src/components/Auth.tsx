import { KAJA_CLI_CLIENT_ID } from "@kaja/schemas"
import { Box, Text } from "ink"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { authClient } from "../lib/auth-client"
import { getAccessToken, setAccessToken, setSessionAccessToken } from "../lib/token"

export function Auth() {
  const [status, setStatus] = useState<"checking" | "polling" | "success" | "error">("checking")
  const [verificationUrl, setVerificationUrl] = useState<string>("")
  const [qrCode, setQrCode] = useState<string>("")
  const sessionQuery = authClient.useSession()

  useEffect(() => {
    async function checkExistingSession() {
      const storedToken = await getAccessToken()
      if (storedToken) {
        const { data: session } = await authClient.getSession()
        if (session?.user) {
          setStatus("success")
          return
        }
      }

      // Start device authorization
      const { data, error } = await authClient.device.code({
        client_id: KAJA_CLI_CLIENT_ID
      })

      if (error || !data) {
        throw new Error(error?.error_description ?? "Device authorization failed")
      }

      const url = data.verification_uri_complete ?? `${data.verification_uri}?user_code=${data.user_code}`
      setVerificationUrl(url)

      // Generate QR code
      try {
        const qr = await QRCode.toString(url, { type: "terminal", small: true })
        setQrCode(qr)
      } catch {
        // QR code generation failed, continue without it
      }

      // Automatically open the URL in browser
      try {
        const open = await import("open")
        await open.default(url)
      } catch {
        // Failed to open browser, user will need to manually open the link
      }

      setStatus("polling")

      // Poll for token
      pollForToken(data.device_code, data.interval ?? 5, Date.now() + (data.expires_in ?? 1800) * 1000)
    }

    checkExistingSession()
  }, [])

  async function pollForToken(deviceCode: string, intervalSec: number, deadline: number) {
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, intervalSec * 1000))

      const { data, error } = await authClient.device.token({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: KAJA_CLI_CLIENT_ID
      })

      if (data?.access_token) {
        try {
          await setAccessToken(data.access_token)
        } catch {
          setSessionAccessToken(data.access_token)
        }
        await sessionQuery.refetch()
        setStatus("success")
        return
      }

      if (error?.error === "authorization_pending") {
      } else if (error?.error === "slow_down") {
        intervalSec += 5
      } else if (error) {
        throw new Error(error.error ?? "Token polling failed")
      }
    }

    throw new Error("Device authorization timed out")
  }

  return (
    <Box flexDirection="column" padding={1}>
      {status === "checking" && <Text>Checking authentication...</Text>}

      {status === "polling" && (
        <Box flexDirection="column" gap={1}>
          <Text>Approve the login using the displayed URL or QR code.</Text>
          <Text color="cyan">{verificationUrl}</Text>
          {qrCode && <Text>{qrCode}</Text>}
        </Box>
      )}

      {status === "success" && (
        <Box>
          <Text color="green">✓ Authentication successful!</Text>
        </Box>
      )}
    </Box>
  )
}
