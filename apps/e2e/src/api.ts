import { waitForCode } from "./mail"
import type { Stack } from "./stack"

export type TurnResult = {
  session: string
  status: string
  message: string
  steps: { type: string; [key: string]: unknown }[]
  [key: string]: unknown
}

export type ApiUser = {
  email: string
  token: string
  /** Any API call as this user; the raw response, so a scenario can assert on a refusal. */
  call(method: string, path: string, body?: unknown): Promise<Response>
  /** `call`, parsed, and a failure thrown. */
  json<T = unknown>(method: string, path: string, body?: unknown): Promise<T>
  /** POST /nasi/turn. */
  turn(body: {
    message?: string
    session?: string
    personaId?: string
    approval?: "approve" | "approve_session" | "decline"
    [key: string]: unknown
  }): Promise<TurnResult>
  /** POST /nasi/compact. */
  compact(
    session: string,
    focus?: string
  ): Promise<{ compacted: { beforeTokens: number; afterTokens: number; dropped: boolean } | null }>
  sessions(): Promise<{ id: string; title: string; persona: string; model: string; updatedAt: string }[]>
}

/** Signs `email` up through the API (the emailed-code flow, consent given) and returns its bearer token, as the TUI has. */
export async function signUp(stack: Stack, email: string): Promise<ApiUser> {
  const send = (path: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${stack.apiUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: stack.webUrl, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })

  const sent = await send("/auth/email-otp/send-verification-otp", "POST", { email, type: "sign-in" })
  if (!sent.ok) throw new Error(`Sending the code failed: ${sent.status} ${await sent.text()}`)
  const signedIn = await send("/auth/sign-in/email-otp", "POST", {
    email,
    otp: await waitForCode(email),
    consent: true,
    locale: "en-GB"
  })
  if (!signedIn.ok) throw new Error(`Signing in failed: ${signedIn.status} ${await signedIn.text()}`)
  const token = signedIn.headers.get("set-auth-token")
  if (!token) throw new Error("The sign-in response carried no set-auth-token header")

  const call: ApiUser["call"] = (method, path, body) => send(path, method, body, { authorization: `Bearer ${token}` })
  const json: ApiUser["json"] = async (method, path, body) => {
    const response = await call(method, path, body)
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`)
    return (await response.json()) as never
  }

  return {
    email,
    token,
    call,
    json,
    turn: body => json("POST", "/nasi/turn", body),
    compact: (session, focus) => json("POST", "/nasi/compact", { session, ...(focus ? { focus } : {}) }),
    sessions: async () =>
      (await json<{ sessions: Awaited<ReturnType<ApiUser["sessions"]>> }>("GET", "/nasi/sessions")).sessions
  }
}
