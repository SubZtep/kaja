import { locales } from "@kaja/shared/locale"
import {
  adminClient,
  deviceAuthorizationClient,
  emailOTPClient,
  inferAdditionalFields
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export function createAuthClientWithUrl(apiUrl: string) {
  return createAuthClient({
    baseURL: apiUrl,
    basePath: "/auth",
    plugins: [
      adminClient(),
      deviceAuthorizationClient(),
      emailOTPClient(),
      // Mirrors the API's user.additionalFields, so updateUser and the session user know `locale`.
      inferAdditionalFields({ user: { locale: { type: [...locales], required: false } } })
    ],
    fetchOptions: {
      credentials: "include"
    }
  })
}

let authClient: ReturnType<typeof createAuthClientWithUrl> | null = null

/** The shared Better Auth client; code that runs on the landing page loads it with `loadAuthClient` instead. */
export function getAuthClient(apiUrl: string) {
  authClient ??= createAuthClientWithUrl(apiUrl)
  return authClient
}
