import { waitForCode } from "./mail"
import type { Stack } from "./stack"

export type ApiUser = {
  email: string
  token: string
  /** POST /nasi/turn; returns the response body. */
  turn(
    body: Record<string, unknown>
  ): Promise<{ session: string; status: string; message?: string | null; [key: string]: unknown }>
}

/** Signs `email` up through the API (the emailed-code flow, consent given) and returns its bearer token, as the TUI has. */
export async function signUp(stack: Stack, email: string): Promise<ApiUser> {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${stack.apiUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: stack.webUrl, ...headers },
      body: JSON.stringify(body)
    })

  const sent = await post("/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
  if (!sent.ok) throw new Error(`Sending the code failed: ${sent.status} ${await sent.text()}`)
  const signedIn = await post("/auth/sign-in/email-otp", {
    email,
    otp: await waitForCode(email),
    consent: true,
    locale: "en-GB"
  })
  if (!signedIn.ok) throw new Error(`Signing in failed: ${signedIn.status} ${await signedIn.text()}`)
  const token = signedIn.headers.get("set-auth-token")
  if (!token) throw new Error("The sign-in response carried no set-auth-token header")

  return {
    email,
    token,
    turn: async body => {
      const response = await post("/nasi/turn", body, { authorization: `Bearer ${token}` })
      if (!response.ok) throw new Error(`Turn failed: ${response.status} ${await response.text()}`)
      return (await response.json()) as Awaited<ReturnType<ApiUser["turn"]>>
    }
  }
}
