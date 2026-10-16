import { mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { randomUUIDv7 } from "@kaja/shared/id"
import { getToolDeps } from "../tools/deps"
import { ImageError, type NormalizedImage, normalizeImage } from "./normalize"

/** An image as a data URL, the way a model request carries it. */
export const imageDataUrl = (image: { data: Uint8Array; mimeType: string }) =>
  `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`

const DATA_URL = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s

/** A base64 data URL's bytes; undefined for anything else (an http URL). */
export function dataUrlBytes(url: string): Uint8Array | undefined {
  const match = DATA_URL.exec(url)
  return match ? Buffer.from(match[2]!, "base64") : undefined
}

/** What a model is told in place of images it couldn't be shown, e.g. "(1 image not shown: not an image)". */
export function imageNote(reasons: string[]): string {
  if (reasons.length === 0) return ""
  const count = reasons.length === 1 ? "1 image" : `${reasons.length} images`
  return `(${count} not shown: ${[...new Set(reasons)].join("; ")})`
}

/** `text` with {@link imageNote} after it, when any image was refused. */
export function withImageNote(text: string, reasons: string[]): string {
  const note = imageNote(reasons)
  if (!note) return text
  return text ? `${text}\n\n${note}` : note
}

/** A prompt image (a data URL or bytes) normalised into the data URL the model is sent, or why it can't be; another URL passes as it is. */
export async function normalizePromptImage(input: string | Uint8Array): Promise<{ url: string } | { error: string }> {
  const bytes = typeof input === "string" ? dataUrlBytes(input) : input
  if (!bytes) return { url: input as string }
  try {
    return { url: imageDataUrl(await normalizeImage(bytes)) }
  } catch (error) {
    if (error instanceof ImageError) return { error: error.message }
    throw error
  }
}

/** A tool's image file, normalised: where its model-sized copy is (the file itself when it already was), or why it can't be shown. */
export async function normalizeImageFile(
  path: string
): Promise<{ path: string; image: NormalizedImage } | { error: string }> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
  } catch {
    return { error: "the image file is gone" }
  }
  try {
    const image = await normalizeImage(bytes)
    if (image.data === bytes) return { path, image }
    const copy = join(await copyDir(path), `${randomUUIDv7()}.${image.mimeType === "image/png" ? "png" : "jpg"}`)
    await Bun.write(copy, image.data)
    return { path: copy, image }
  } catch (error) {
    if (error instanceof ImageError) return { error: error.message }
    throw error
  }
}

// Beside a tool's own temp file (a cloud turn removes that folder when it ends), else the tool temp folder: never a user's folder.
async function copyDir(source: string): Promise<string> {
  const temp = getToolDeps().tempDir ?? join(tmpdir(), "kaja-images")
  const folder = dirname(resolve(source))
  const inside = (root: string) => folder === resolve(root) || folder.startsWith(`${resolve(root)}/`)
  if (inside(temp) || inside(tmpdir())) return folder
  await mkdir(temp, { recursive: true })
  return temp
}
