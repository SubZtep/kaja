import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import { imageRefId, inlineImages, type SessionImages } from "../store/images"
import { warn } from "../warn"
import type { Agent, Session } from "./agent"
import { describeInBackground, imageLabel } from "./describe"

/** The note a model gets where a stored image is gone. */
export const MISSING_IMAGE = "[an image that is no longer stored]"

// Each run's images as data URLs by ref, so a round after the first fetches nothing it already has.
const caches = new WeakMap<Session, Map<string, string>>()

/** Starts a run's image cache afresh: earlier runs' bytes aren't kept around. */
export function resetImageCache(session: Session): void {
  caches.set(session, new Map())
}

const cacheOf = (session: Session) => caches.get(session) ?? caches.set(session, new Map()).get(session)!

/** Where a session's images go: its store's, once it has an id; else they stay inline in the messages. */
export function sessionImagesFor(agent: Agent, session: Session): SessionImages {
  return agent.store && session.id ? agent.store.images(session.id) : inlineImages
}

/** An arriving image as stored: the ref its message holds (a data URL when inline), the object keys hosts show it from (`original`: what a viewer opens), and its size. */
export type ArrivedImage = {
  ref: string
  key?: string
  original?: string
  mimeType: string
  width: number
  height: number
}

/** An image's parts in its message: its label (alt text, later its description) and the image itself. */
export type ImageParts = [{ type: "text"; text: string }, { type: "image_url"; image_url: { url: string } }]

/** Longest alt text taken from the image's source (a tool's text, a caption). */
const MAX_ALT = 125

/** The first line of `text`, as alt text: what a tool said about its image, say. */
export function altFrom(text: string | undefined, fallback: string): string {
  const line = text
    ?.split("\n")
    .find(candidate => candidate.trim())
    ?.trim()
  if (!line) return fallback
  return line.length > MAX_ALT ? `${line.slice(0, MAX_ALT - 1)}…` : line
}

/**
 * Normalises and stores one arriving image (bytes, or a data URL as a bot downloads a photo): the untouched bytes go
 * beside it for debugging. Its label starts as `alt`, which the vision model's description replaces once it's
 * written (see `describeInBackground`); seen before in this session, it takes that description at once. One that
 * can't be used comes back as the reason why.
 */
export async function storeImage(
  agent: Agent,
  session: Session,
  input: Uint8Array | string,
  alt: string
): Promise<(ArrivedImage & { parts: ImageParts }) | { error: string }> {
  const bytes = typeof input === "string" ? dataUrlBytes(input) : input
  if (!bytes) return { error: "only images sent as data can be shown" }
  try {
    const image = await normalizeImage(bytes)
    const images = sessionImagesFor(agent, session)
    const stored = await images.put(image, bytes)
    const dataUrl = imageDataUrl(image)
    cacheOf(session).set(stored.ref, dataUrl)
    const size = { width: image.width, height: image.height }
    const id = imageRefId(stored.ref)
    if (id)
      describeInBackground(agent, session, { ref: stored.ref, size }, dataUrl, {
        saved: () => images.description(id),
        save: (text, model) => images.describe(id, text, model)
      })
    const parts: ImageParts = [
      { type: "text", text: imageLabel(stored.ref, size, alt) },
      { type: "image_url", image_url: { url: stored.ref } }
    ]
    return { ...stored, mimeType: image.mimeType, ...size, parts }
  } catch (error) {
    if (error instanceof ImageError) return { error: error.message }
    throw error
  }
}

/**
 * What a provider is sent: `messages` with each stored image's ref swapped for its bytes as a data URL (only the
 * images still in them: compaction already left out the old ones). A missing image becomes {@link MISSING_IMAGE}.
 */
export async function resolveImageRefs(
  agent: Agent,
  session: Session,
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletionMessageParam[]> {
  if (!messages.some(hasRef)) return messages
  const cache = cacheOf(session)
  const refs = new Set<string>()
  for (const message of messages)
    if (message.role === "user" && Array.isArray(message.content))
      for (const part of message.content)
        if (part.type === "image_url" && imageRefId(part.image_url.url) && !cache.has(part.image_url.url))
          refs.add(part.image_url.url)
  const images = sessionImagesFor(agent, session)
  await Promise.all(
    [...refs].map(async ref => {
      const image = await images.get(imageRefId(ref)!).catch(error => {
        warn("A stored image couldn't be read", { ref, error })
        return undefined
      })
      if (image) cache.set(ref, imageDataUrl(image))
      else warn("A stored image is gone", { ref })
    })
  )
  return messages.map(message => {
    if (message.role !== "user" || !Array.isArray(message.content) || !hasRef(message)) return message
    return {
      ...message,
      content: message.content.map(part => {
        if (part.type !== "image_url" || !imageRefId(part.image_url.url)) return part
        const url = cache.get(part.image_url.url)
        return url ? { ...part, image_url: { ...part.image_url, url } } : { type: "text" as const, text: MISSING_IMAGE }
      })
    }
  })
}

function hasRef(message: ChatCompletionMessageParam): boolean {
  return (
    message.role === "user" &&
    Array.isArray(message.content) &&
    message.content.some(part => part.type === "image_url" && imageRefId(part.image_url.url) !== undefined)
  )
}

/** `messages` with their images left out, labels kept: what a chat model that can't see is sent. */
export function withoutImageParts(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  return messages.map(message =>
    message.role === "user" && Array.isArray(message.content) && message.content.some(part => part.type === "image_url")
      ? { ...message, content: message.content.filter(part => part.type !== "image_url") }
      : message
  )
}
