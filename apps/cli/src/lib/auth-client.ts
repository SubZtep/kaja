import { deviceAuthorizationClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { apiBaseUrl } from "./clients"
import { getAccessToken } from "./token"

export const authClient = createAuthClient({
  disableDefaultFetchPlugins: true,
  baseURL: apiBaseUrl,
  basePath: "/auth",
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: async () => {
        const token = await getAccessToken()
        return token?.trim() || undefined
      }
    }
  },
  plugins: [deviceAuthorizationClient()]
})
