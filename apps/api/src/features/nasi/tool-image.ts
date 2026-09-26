import { imageHash, imageKey, sessionImagePrefix } from "@kaja/nasi"
import { files, signedUrl, toolImagePrefix } from "../../core/files"

/** How long a tool image's signed URL works: long enough to show it, and for Telegram to fetch it. */
const TOOL_IMAGE_URL_TTL_SECONDS = 60 * 60

/**
 * Uploads a tool's image file (the file is gone after the turn) and returns a signed URL for the client to fetch it.
 * A turn on an existing session stores it where the session's save will find it, so it's uploaded once.
 */
export async function toolImageUrl(
  userId: string,
  sessionId: string | undefined,
  path: string,
  mimeType: string
): Promise<string> {
  const data = new Uint8Array(await Bun.file(path).arrayBuffer())
  const prefix = sessionId ? sessionImagePrefix(sessionId, userId) : toolImagePrefix(userId)
  const key = imageKey(prefix, imageHash(data))
  await files.upload(key, data, { contentType: mimeType })
  return signedUrl(key, TOOL_IMAGE_URL_TTL_SECONDS)
}
