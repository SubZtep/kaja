import { KajaAPI } from "@kaja/sdk"
import { apiBaseUrl } from "./clients"
import { getAccessToken } from "./token"

export const sdk = new KajaAPI({
  baseUrl: apiBaseUrl,
  getAccessToken: async () => {
    const token = await getAccessToken()
    // getAccessToken returns empty string when no token, SDK expects null
    return token && token.trim().length > 0 ? token : null
  }
})
