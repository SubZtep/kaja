import { log } from "../logger"
import { clearToken, loadToken } from "./credentials"
import { KAJA_USER_AGENT } from "./user-agent"

// A slow network only delays startup this long; past it the token counts as fine.
const TIMEOUT_MS = 5000

/**
 * Whether the API turns this token away (401: expired or revoked). Offline or any other answer counts as fine, so a
 * network hiccup never signs anyone out.
 */
export async function isTokenRejected(
  apiUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(new URL("/nasi/info", apiUrl), {
      headers: { authorization: `Bearer ${token}`, "User-Agent": KAJA_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    return res.status === 401
  } catch (error) {
    log.warn("Couldn't check the stored cloud token", { error })
    return false
  }
}

/**
 * The stored cloud token while the API still takes it. One it refuses is cleared, and `onExpired` runs, so the caller
 * can say why a sign-in follows.
 */
export async function usableStoredToken(
  apiUrl: string,
  onExpired: () => void,
  fetchImpl: typeof fetch = fetch
): Promise<string | undefined> {
  const stored = await loadToken()
  if (!stored) return undefined
  if (!(await isTokenRejected(apiUrl, stored, fetchImpl))) return stored
  await clearToken()
  onExpired()
  return undefined
}
