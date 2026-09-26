import { imageHash, imageKey } from "@kaja/nasi"
import { files, toolImagePrefix } from "../../core/files"

/** How long a tool image's signed URL works: long enough to show it, and for Telegram to fetch it. */
const TOOL_IMAGE_URL_TTL_SECONDS = 60 * 60

/** Uploads a tool's image file (the file is gone after the turn) and returns a signed URL for the client to fetch it. */
export async function toolImageUrl(userId: string, path: string, mimeType: string): Promise<string> {
  const data = new Uint8Array(await Bun.file(path).arrayBuffer())
  const key = imageKey(toolImagePrefix(userId), imageHash(data))
  await files.upload(key, data, { contentType: mimeType })
  return files.url(key, { expiresIn: TOOL_IMAGE_URL_TTL_SECONDS })
}
