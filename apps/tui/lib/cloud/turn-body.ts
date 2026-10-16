import { type NasiToolResult, TOOL_RESULT_TEXT_MAX, TURN_BODY_MAX_BYTES } from "@kaja/schema/nasi"
import { capText } from "@kaja/shared/text"

// Headroom for what the stream request adds around the body.
const BODY_BUDGET = Math.floor(TURN_BODY_MAX_BYTES * 0.9)

const bytesOf = (body: unknown) => Buffer.byteLength(JSON.stringify(body))

/**
 * The turn request with its tool results' images left out, biggest first, until the whole body fits the API's limit;
 * each result that lost one says so in its text. A body that already fits comes back as it is.
 */
export function fitTurnBody<T extends { toolResults?: NasiToolResult[] }>(body: T, maxBytes = BODY_BUDGET): T {
  if (!body.toolResults || bytesOf(body) <= maxBytes) return body
  const results = body.toolResults.map(result => ({ ...result, images: [...(result.images ?? [])] }))
  const dropped = new Map<number, number>()
  const biggest = results
    .flatMap((result, at) => result.images.map(image => ({ at, image })))
    .sort((a, b) => b.image.data.length - a.image.data.length)
  const fitted = () => ({ ...body, toolResults: results.map((result, at) => withNote(result, dropped.get(at))) })
  for (const { at, image } of biggest) {
    if (bytesOf(fitted()) <= maxBytes) break
    results[at]!.images = results[at]!.images.filter(kept => kept !== image)
    dropped.set(at, (dropped.get(at) ?? 0) + 1)
  }
  return fitted()
}

function withNote(result: NasiToolResult & { images: NonNullable<NasiToolResult["images"]> }, dropped = 0) {
  const { images, ...rest } = result
  const kept = images.length ? { images } : {}
  if (dropped === 0) return { ...rest, ...kept }
  const leftOut = dropped === 1 ? "1 image" : `${dropped} images`
  const note = `(${leftOut} left out: this turn's request would be too large)`
  const text = capText(result.text, TOOL_RESULT_TEXT_MAX - note.length - 2)
  return { ...rest, ...kept, text: text ? `${text}\n\n${note}` : note }
}
