import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import { imageRefId, inlineImages, type SessionImages } from "../store/images"
import { warn } from "../warn"
import type { Agent, Session } from "./agent"

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

/** An arriving image as stored: the ref its message holds (a data URL when inline), and the object key hosts show it from. */
export type ArrivedImage = { ref: string; key?: string; mimeType: string }

/**
 * Normalises and stores one arriving image (bytes, or a data URL as a bot downloads a photo): the untouched bytes go
 * beside it for debugging. Another URL passes as it is; one that can't be used comes back as the reason why.
 */
export async function storeImage(
  agent: Agent,
  session: Session,
  input: Uint8Array | string
): Promise<ArrivedImage | { error: string }> {
  const bytes = typeof input === "string" ? dataUrlBytes(input) : input
  if (!bytes) return { ref: input as string, mimeType: "" }
  try {
    const image = await normalizeImage(bytes)
    const stored = await sessionImagesFor(agent, session).put(image, bytes)
    cacheOf(session).set(stored.ref, imageDataUrl(image))
    return { ...stored, mimeType: image.mimeType }
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
