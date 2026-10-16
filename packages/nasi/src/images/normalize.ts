import { TOOL_RESULT_IMAGE_BASE64_MAX } from "@kaja/schema/nasi"

/** An image as models see it and stores keep it: at most {@link MAX_IMAGE_EDGE} on a side, no EXIF, JPEG or PNG. */
export type NormalizedImage = { data: Uint8Array; mimeType: "image/jpeg" | "image/png"; width: number; height: number }

/** Longest side of a normalised image: what Claude takes without shrinking it again, and plenty for OpenAI and Gemini. */
export const MAX_IMAGE_EDGE = 1568
/** Largest normalised image: its base64 just fits a client tool result. */
export const MAX_IMAGE_BYTES = (TOOL_RESULT_IMAGE_BASE64_MAX / 4) * 3

const JPEG_QUALITY = 85
// A 50 MP phone photo fits; Bun's own default (268 MP) would let one upload take gigabytes to decode.
const MAX_PIXELS = 52_000_000
// The smaller side tried when an image is still over MAX_IMAGE_BYTES at full size.
const FALLBACK_EDGE = 1024

/** Why an image can't be used, in words a model or a person can act on. */
export class ImageError extends Error {
  readonly code: "not-an-image" | "unsupported" | "too-large" | "undecodable"

  constructor(message: string, code: ImageError["code"]) {
    super(message)
    this.name = "ImageError"
    this.code = code
  }
}

/**
 * Makes any image a model-sized JPEG or PNG: EXIF orientation applied and its metadata (GPS) dropped, fitted inside
 * {@link MAX_IMAGE_EDGE}, a PNG kept PNG (and a GIF or a transparent WebP made one: JPEG would turn transparency
 * black), everything else JPEG. One already normalised comes back as it is, so normalising twice costs nothing.
 * Throws {@link ImageError} for bytes that aren't an image this host can read, or one too big even when smaller.
 */
export async function normalizeImage(bytes: Uint8Array): Promise<NormalizedImage> {
  const meta = await decoding(() => new Bun.Image(bytes, { maxPixels: MAX_PIXELS }).metadata())
  if (isNormalized(bytes, meta)) return { data: bytes, mimeType: `image/${meta.format}`, ...size(meta) }
  const png = meta.format === "png" || meta.format === "gif" || (meta.format === "webp" && webpHasAlpha(bytes))
  const encode = (edge: number, palette = false) =>
    decoding(async () => {
      const image = new Bun.Image(bytes, { maxPixels: MAX_PIXELS }).resize(edge, edge, {
        fit: "inside",
        withoutEnlargement: true
      })
      if (png) image.png({ compressionLevel: 9, palette })
      else image.jpeg({ quality: JPEG_QUALITY })
      const data = await image.bytes()
      return { data, width: image.width, height: image.height }
    })
  const attempts = png
    ? [() => encode(MAX_IMAGE_EDGE), () => encode(MAX_IMAGE_EDGE, true), () => encode(FALLBACK_EDGE, true)]
    : [() => encode(MAX_IMAGE_EDGE), () => encode(FALLBACK_EDGE)]
  for (const attempt of attempts) {
    const out = await attempt()
    if (out.data.length <= MAX_IMAGE_BYTES) return { ...out, mimeType: png ? "image/png" : "image/jpeg" }
  }
  throw new ImageError("the image is too large, even made smaller", "too-large")
}

type Metadata = { width: number; height: number; format: string }

const size = (meta: Metadata) => ({ width: meta.width, height: meta.height })

// Already a JPEG or PNG within the limits and without EXIF: re-encoding it would only lose quality.
function isNormalized(bytes: Uint8Array, meta: Metadata): meta is Metadata & { format: "jpeg" | "png" } {
  if (meta.format !== "jpeg" && meta.format !== "png") return false
  if (meta.width > MAX_IMAGE_EDGE || meta.height > MAX_IMAGE_EDGE || bytes.length > MAX_IMAGE_BYTES) return false
  return !Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).includes(
    meta.format === "jpeg" ? "Exif\0\0" : "eXIf"
  )
}

// A WebP's alpha: the extended header's flag, or a lossless image's alpha_is_used bit.
function webpHasAlpha(bytes: Uint8Array): boolean {
  const chunk = String.fromCodePoint(...bytes.subarray(12, 16))
  if (chunk === "VP8X") return ((bytes[20] ?? 0) & 0x10) !== 0
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = new DataView(bytes.buffer, bytes.byteOffset).getUint32(21, true)
    return ((bits >>> 28) & 1) === 1
  }
  return false
}

// Runs a Bun.Image terminal, its failures turned into ImageErrors.
async function decoding<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw imageError(error)
  }
}

function imageError(error: unknown): unknown {
  const code = (error as { code?: string })?.code
  switch (code) {
    case "ERR_IMAGE_UNKNOWN_FORMAT":
      return new ImageError("not an image", "not-an-image")
    case "ERR_IMAGE_FORMAT_UNSUPPORTED":
      return new ImageError(
        "this kind of image can't be read here (HEIC, AVIF and TIFF need macOS or Windows)",
        "unsupported"
      )
    case "ERR_IMAGE_TOO_MANY_PIXELS":
      return new ImageError("the image has too many pixels", "too-large")
    case "ERR_IMAGE_DECODE_FAILED":
      return new ImageError("the image is damaged and can't be read", "undecodable")
    default:
      return error
  }
}
