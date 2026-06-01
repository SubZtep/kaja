export const SERVICE_NAME = "io.kaja"
export const ACCESS_TOKEN_KEY = "access_token"

let sessionAccessToken: string | null = null

/** Used when Bun.secrets.set fails so this process can still call the API. */
export function setSessionAccessToken(token: string) {
  const trimmed = token.trim()
  sessionAccessToken = trimmed.length > 0 ? trimmed : null
}

export async function getAccessToken() {
  if (sessionAccessToken) {
    return sessionAccessToken
  }
  const token = await Bun.secrets.get({
    service: SERVICE_NAME,
    name: ACCESS_TOKEN_KEY
  })
  return token?.trim() ?? ""
}

export async function setAccessToken(value: string) {
  await Bun.secrets.set({
    service: SERVICE_NAME,
    name: ACCESS_TOKEN_KEY,
    value
  })
  sessionAccessToken = null
}

export async function deleteAccessToken() {
  sessionAccessToken = null
  return await Bun.secrets.delete({
    service: SERVICE_NAME,
    name: ACCESS_TOKEN_KEY
  })
}
