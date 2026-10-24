import { userImagePrefix } from "@kaja/nasi"
import { sql } from "../../core/db"
import { env } from "../../core/env"
import { imageUrl, objects } from "../../core/files"
import { reportError } from "../../core/report"

/** Longest side of a stored profile picture. */
const AVATAR_SIZE = 256
// A picture bigger than this is no avatar; Gravatar's and Google's are a few KB at this size.
const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 5000

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Gravatar's key for an address: the SHA-256 hex of it trimmed and lower-cased. */
export function gravatarHash(email: string): string {
  return new Bun.CryptoHasher("sha256").update(email.trim().toLowerCase()).digest("hex")
}

/** The address's Gravatar picture; `d=404` makes one without a picture answer 404 instead of a placeholder. */
export function gravatarImageUrl(email: string): string {
  return `https://gravatar.com/avatar/${gravatarHash(email)}?s=${AVATAR_SIZE}&r=pg&d=404`
}

/** A Google picture at {@link AVATAR_SIZE}: Google's URLs end in a size option such as `=s96-c`. */
export function googlePictureUrl(url: string): string {
  return url.replace(/=s\d+(-c)?$/, `=s${AVATAR_SIZE}-c`)
}

/**
 * The public Gravatar profile's display name, if it has a usable one (no profile, or over the 100-an-hour keyless
 * limit, gives none). Sends `GRAVATAR_API_KEY` when set, which lifts that limit.
 */
export async function gravatarName(email: string, fetcher: Fetch = fetch): Promise<string | undefined> {
  const res = await fetcher(`https://api.gravatar.com/v3/profiles/${gravatarHash(email)}`, {
    headers: env.GRAVATAR_API_KEY ? { Authorization: `Bearer ${env.GRAVATAR_API_KEY}` } : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) return undefined
  const { display_name } = (await res.json()) as { display_name?: unknown }
  const name = typeof display_name === "string" ? display_name.trim().slice(0, 100) : ""
  return name.length >= 2 ? name : undefined
}

/**
 * Copies a picture into the user's images as a WebP of at most {@link AVATAR_SIZE} (no EXIF), returning its public URL;
 * undefined when the source has none.
 */
export async function storeAvatar(userId: string, source: string, fetcher: Fetch = fetch): Promise<string | undefined> {
  const res = await fetcher(source, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) return undefined
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length > MAX_SOURCE_BYTES) return undefined
  const image = new Bun.Image(bytes, { maxPixels: 25_000_000 })
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
  const data = await image.bytes()
  // A new name per picture, so browsers never show a cached old one
  const id = new Bun.CryptoHasher("sha256").update(data).digest("hex").slice(0, 16)
  const prefix = `${userImagePrefix(userId)}/avatar/`
  await objects.deletePrefix(prefix)
  const key = `${prefix}${id}.webp`
  await objects.put(key, data, "image/webp")
  return imageUrl(key)
}

/** Swaps the user's picture for a stored copy of `source`, unless they changed it from `previous` meanwhile. */
async function copyPicture(userId: string, source: string, previous: string, fetcher: Fetch) {
  const image = await storeAvatar(userId, source, fetcher)
  if (!image) return
  await sql`UPDATE "user" SET image = ${image}, updated_at = now() WHERE id = ${userId} AND COALESCE(image, '') = ${previous}`
}

/** Whether a URL is a Google account picture: the only outside picture the API fetches besides Gravatar's. */
export function isGooglePicture(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === "https:" && hostname.endsWith(".googleusercontent.com")
  } catch {
    return false
  }
}

/**
 * Keeps a copy of a Google picture instead of linking it, so viewers' browsers don't call Google; the user's picture
 * must still be `previous` (the Google URL on a new account, blank when it fills one). Never throws.
 */
export async function copyGooglePicture(
  userId: string,
  picture: string,
  previous: string,
  fetcher: Fetch = fetch
): Promise<void> {
  if (!isGooglePicture(picture)) return
  await copyPicture(userId, googlePictureUrl(picture), previous, fetcher).catch(err =>
    reportError("Failed to copy a Google picture", err, { userId })
  )
}

/** Fills a new account's blank name and picture from the address's Gravatar, if it has one. Never throws. */
export async function fillFromGravatar(user: { id: string; email: string }, fetcher: Fetch = fetch): Promise<void> {
  const name = gravatarName(user.email, fetcher).then(async found => {
    if (found)
      await sql`UPDATE "user" SET name = ${found}, updated_at = now() WHERE id = ${user.id} AND btrim(name) = ''`
  })
  const picture = copyPicture(user.id, gravatarImageUrl(user.email), "", fetcher)
  for (const result of await Promise.allSettled([name, picture]))
    if (result.status === "rejected")
      reportError("Failed to fill a profile from Gravatar", result.reason, { userId: user.id })
}
