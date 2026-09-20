type GoogleProfile = { name?: string; image?: string }

/** Reads name and picture from a Google id token that Better Auth already verified and stored; no signature check here. */
export function googleProfileFromIdToken(idToken: string | null | undefined): GoogleProfile {
  const payload = idToken?.split(".")[1]
  if (!payload) return {}
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      name?: unknown
      picture?: unknown
    }
    return {
      name: typeof claims.name === "string" ? claims.name.trim() : undefined,
      image: typeof claims.picture === "string" ? claims.picture : undefined
    }
  } catch {
    return {}
  }
}

/** The fields to copy from Google: only those the user has left blank, and only when Google has a value. */
export function blankProfileFields(user: { name?: string | null; image?: string | null }, google: GoogleProfile) {
  const fill: GoogleProfile = {}
  if (!user.name?.trim() && google.name) fill.name = google.name
  if (!user.image && google.image) fill.image = google.image
  return fill
}
