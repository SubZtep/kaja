/** Who may use which sandboxed MCP ability, until when (`exp`: Unix seconds). */
export type SandboxClaims = { sub: string; ability: string; exp: number }

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  } catch {
    return undefined
  }
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage])
}

/** A bearer token the API hands a cloud turn for one sandboxed MCP ability: the claims, HMAC-SHA256 signed with the shared secret. */
export async function signSandboxToken(claims: SandboxClaims, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(claims)))
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload))
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/** The token's claims when its signature holds and it hasn't expired, else undefined. */
export async function verifySandboxToken(
  token: string,
  secret: string,
  now = Date.now()
): Promise<SandboxClaims | undefined> {
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra !== undefined) return undefined
  const signatureBytes = fromBase64Url(signature)
  const payloadBytes = fromBase64Url(payload)
  if (!signatureBytes || !payloadBytes) return undefined
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    signatureBytes,
    encoder.encode(payload)
  )
  if (!valid) return undefined
  try {
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<SandboxClaims>
    if (typeof claims.sub !== "string" || typeof claims.ability !== "string" || typeof claims.exp !== "number")
      return undefined
    if (claims.exp * 1000 <= now) return undefined
    return { sub: claims.sub, ability: claims.ability, exp: claims.exp }
  } catch {
    return undefined
  }
}
