import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { ImageError, normalizeImage } from "../images/normalize"
import { dataUrlBytes, imageDataUrl } from "../images/parts"
import { fetchPublicHttp } from "../security/ssrf"
import { imageRefId, type ImageSource, inlineImages, type SessionImages } from "../store/images"
import { getToolDeps } from "../tools/deps"
import { warn } from "../warn"
import type { Agent, Session } from "./agent"
import { describeInBackground, imageLabel } from "./describe"

/** The note a model gets where a stored image is gone. */
export const MISSING_IMAGE = "[an image that is no longer stored]"

// Each run's images as data URLs by ref, so a round after the first fetches nothing it already has.
const caches = new WeakMap<Session, Map<string, string>>()

/** Empties a session's image cache: a run's bytes aren't kept around after it. */
export function resetImageCache(session: Session): void {
  caches.set(session, new Map())
}

const cacheOf = (session: Session) => caches.get(session) ?? caches.set(session, new Map()).get(session)!

/** Where a session's images go: its store's, once it has an id; else they stay inline in the messages. */
export function sessionImagesFor(agent: Agent, session: Session): SessionImages {
  return agent.store && session.id ? agent.store.images(session.id) : inlineImages
}

/**
 * An arriving image as stored: the ref its message holds (a data URL when inline), the object key hosts show it from,
 * and its size.
 */
export type ArrivedImage = {
  ref: string
  key?: string
  mimeType: string
  width: number
  height: number
}

/**
 * An image going to the model with a prompt: a data URL or bytes, or either with where it came from and, for an
 * approved tool's image, the `alt` text its tool gave it (without one, it's an image the user sent).
 */
export type PromptImage = string | Uint8Array | { data: string | Uint8Array; alt?: string; source?: ImageSource }

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
 * Normalises and stores one arriving image (bytes, or a data URL as a bot downloads a photo), with what its arrival
 * knows of its `source`. Its label starts as `alt`, which the vision model's description replaces once it's written
 * (see `describeInBackground`); seen before in this session, it takes that description at once. One that can't be used
 * comes back as the reason why.
 */
export async function storeImage(
  agent: Agent,
  session: Session,
  input: Uint8Array | string,
  alt: string,
  source?: ImageSource
): Promise<(ArrivedImage & { parts: ImageParts }) | { error: string }> {
  const bytes = typeof input === "string" ? dataUrlBytes(input) : input
  if (!bytes) return { error: "only images sent as data can be shown" }
  try {
    const image = await normalizeImage(bytes)
    const images = sessionImagesFor(agent, session)
    const stored = await images.put(image, source)
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

/** A remote image can be as big as a photo; it's shrunk when stored. */
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024
/** Remote images taken from one reply; a gallery past this stays as links. */
const MAX_REPLY_IMAGES = 8
// `![alt](url)`, or `![alt](url "title")` as fetch_url writes an image with a title
const REMOTE_IMAGE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"([^"]*)")?\)/g

/**
 * A reply with each `![alt](http(s) url)` image fetched and stored like any other, and its link swapped for the
 * `kaja-image:` ref, so what the user is shown is always the stored copy. Only where `fetch_url` could reach the
 * network too (a cloud turn without egress has none) and the session has a home for images; a link that can't be
 * fetched or used stays as the model wrote it.
 */
export async function storeRemoteImages(agent: Agent, session: Session, text: string): Promise<string> {
  // Not `toolName`: tools.ts imports this file
  const canFetch = agent.tools.some(
    tool => tool.definition.type === "function" && tool.definition.function.name === "fetch_url"
  )
  if (!session.id || !text.includes("![") || !canFetch) return text
  const found = new Map<string, { alt: string; title?: string }>()
  for (const [, alt, url, title] of text.matchAll(REMOTE_IMAGE))
    if (!found.has(url!)) found.set(url!, { alt: alt!, title })
  const refs = new Map<string, string>()
  await Promise.all(
    [...found].slice(0, MAX_REPLY_IMAGES).map(async ([url, { alt, title }]) => {
      try {
        const res = await fetchPublicHttp(url, { maxBytes: MAX_REMOTE_IMAGE_BYTES, send: getToolDeps().fetchSend })
        if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return
        const data = new Uint8Array(await res.arrayBuffer())
        const stored = await storeImage(agent, session, data, alt || `Image from ${url}`, { url, alt, title })
        if ("ref" in stored && imageRefId(stored.ref)) refs.set(url, stored.ref)
      } catch (error) {
        warn("A reply's image couldn't be stored", { url, error })
      }
    })
  )
  // A stored image's title is in its row; the link is left without it, as hosts place `](kaja-image:<id>)` links
  return text.replace(REMOTE_IMAGE, (link, alt: string, url: string) =>
    refs.has(url) ? `![${alt}](${refs.get(url)})` : link
  )
}

/**
 * What a provider is sent: `messages` with each stored image's ref swapped for its bytes as a data URL (only the images
 * still in them: compaction already left out the old ones). A missing image becomes {@link MISSING_IMAGE}.
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
