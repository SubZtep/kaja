import { locales } from "@kaja/shared"
import { adminClient, deviceAuthorizationClient, inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export function createAuthClientWithUrl(apiUrl: string) {
  return createAuthClient({
    baseURL: apiUrl,
    basePath: "/auth",
    plugins: [
      adminClient(),
      deviceAuthorizationClient(),
      // Mirrors the API's user.additionalFields, so updateUser and the session user know `locale`.
      inferAdditionalFields({ user: { locale: { type: [...locales], required: false } } })
    ],
    fetchOptions: {
      credentials: "include"
    }
  })
}
