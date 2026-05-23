import { KAJA_CLI_CLIENT_ID } from "@kaja/schemas"
import { createAuthClient } from "better-auth/client"
import { deviceAuthorizationClient } from "better-auth/client/plugins"
import clipboard from "clipboardy"
import { Box, Text, useInput } from "ink"
import Spinner from "ink-spinner"
import { useEffect, useState } from "react"
import { apiBaseUrl } from "../lib/clients"
import { getAccessToken, setAccessToken, setSessionAccessToken } from "../lib/token"

interface AuthProps {
  onComplete: () => void
  onError: (error: Error) => void
}

export function Auth({ onComplete, onError }: AuthProps) {
  const [status, setStatus] = useState<"checking" | "polling" | "success" | "error">("checking")
  const [verificationUrl, setVerificationUrl] = useState<string>("")
  const [userCode, setUserCode] = useState<string>("")

  const authClient = createAuthClient({
    baseURL: apiBaseUrl,
    basePath: "/auth",
    plugins: [deviceAuthorizationClient()]
  })

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0)
    }

    if (status === "polling") {
      if (input === "o") {
        // Open browser
        import("open").then(({ default: open }) => open(verificationUrl)).catch(() => {})
      } else if (input === "c") {
        // Copy to clipboard
        clipboard.write(verificationUrl).catch(() => {})
      }
    }
  })

  useEffect(() => {
    async function checkExistingSession() {
      const storedToken = await getAccessToken()
      if (storedToken) {
        const { data: session } = await authClient.getSession({
          fetchOptions: { headers: { Authorization: `Bearer ${storedToken}` } }
        })
        if (session?.user) {
          setStatus("success")
          setTimeout(onComplete, 500)
          return
        }
      }

      // Start device authorization
      const { data, error } = await authClient.device.code({
        client_id: KAJA_CLI_CLIENT_ID
      })

      if (error || !data) {
        onError(new Error(error?.error_description ?? "Device authorization failed"))
        return
      }

      setVerificationUrl(data.verification_uri_complete ?? data.verification_uri)
      setUserCode(data.user_code)
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
        setStatus("success")
        setTimeout(onComplete, 500)
        return
      }

      if (error?.error === "authorization_pending") {
      } else if (error?.error === "slow_down") {
        intervalSec += 5
      } else if (error) {
        onError(new Error(error.error ?? "Token polling failed"))
        return
      }
    }

    onError(new Error("Device authorization timed out"))
  }

  return (
    <Box flexDirection="column" padding={1}>
      {status === "checking" && (
        <Box>
          <Text>
            <Spinner type="dots" />
            {" Checking authentication..."}
          </Text>
        </Box>
      )}

      {status === "polling" && (
        <Box flexDirection="column">
          <Text>Login to continue:</Text>
          <Text color="cyan">{verificationUrl}</Text>
          {userCode && <Text dimColor>User code: {userCode}</Text>}
          <Text>{"\n"}</Text>
          <Text dimColor>Press o to open browser, c to copy link, or Ctrl+C to cancel</Text>
          <Box marginTop={1}>
            <Text>
              <Spinner type="dots" />
              {" Waiting for approval..."}
            </Text>
          </Box>
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
