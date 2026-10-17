import type { Page } from "playwright-core"
import { e2eEnv } from "./env"
import { CHAT_PAGE } from "./telegram-page"

const BOT_ID = 9001
const FIRST_USER_ID = 5150
const BOT_USERNAME = "kaja_e2e_bot"
export const BOT_TOKEN = "9001:e2e-fake-token"

type Button = { text: string; callback_data?: string }
type StoredMessage = {
  id: number
  from: "bot" | "user"
  /** The text as sent: Telegram's HTML subset for a bot's. */
  text: string
  caption?: string
  photo?: string
  buttons: Button[][]
  deleted?: boolean
}

export type BotMessage = { id: number; text: string; plain: string; photo?: string; buttons: string[] }

const stripTags = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")

/** The fake Telegram: a Bot API server the cloud bot long-polls, and the chat window a scenario types into. */
export type Telegram = {
  /** `TELEGRAM_API_ROOT` for the API. */
  apiRoot: string
  /** The chat window's address. */
  url: string
  /** What the bot has said, oldest first, without the messages it deleted. */
  botMessages(): BotMessage[]
  /** Types in the chat window (visible in the video). */
  say(page: Page, text: string): Promise<void>
  /** Opens a `t.me/<bot>?start=<token>` link the way Telegram would: the bot is sent `/start <token>`. */
  openLink(page: Page, link: string): Promise<void>
  /** A message from a group chat, which the bot must ignore (not shown in the chat window). */
  sayInGroup(text: string): Promise<void>
  /** Sends an image through the attach button, with an optional caption typed first. */
  attachImage(page: Page, file: string, caption?: string): Promise<void>
  /** Taps the inline button with this label on the bot's latest message that has one. */
  press(page: Page, label: string): Promise<void>
  /** Waits for the bot's next real message after `after` (not its "…" placeholder, which later becomes the answer). */
  waitForReply(after: number, timeoutMs?: number): Promise<BotMessage>
  /** Waits for the bot's next photo after `after`. */
  waitForPhoto(after: number, timeoutMs?: number): Promise<BotMessage>
  /** The bytes of a photo the bot sent (by upload or by URL). */
  fetchPhoto(message: BotMessage): Promise<Uint8Array>
  /** Waits for a (new) bot message whose text matches; returns it. */
  waitForBot(match: string | RegExp, options?: { after?: number; timeoutMs?: number }): Promise<BotMessage>
  /** A different Telegram user with an empty chat, so one scenario's link or history never reaches the next. */
  reset(): void
  stop(): Promise<void>
}

export async function startTelegram(): Promise<Telegram> {
  const messages: StoredMessage[] = []
  const files = new Map<string, { bytes: Uint8Array<ArrayBuffer>; mime: string }>()
  const updates: { update_id: number; [key: string]: unknown }[] = []
  const waiters: (() => void)[] = []
  let nextMessageId = 1
  let nextUpdateId = 1
  let nextFileId = 1

  let userId = FIRST_USER_ID
  let user = { id: userId, is_bot: false, first_name: "Alice", language_code: "en" }
  let chat = { id: userId, type: "private", first_name: "Alice" }
  const bot = { id: BOT_ID, is_bot: true, first_name: "Kaja E2E", username: BOT_USERNAME }
  const wire = (message: StoredMessage) => ({
    message_id: message.id,
    from: message.from === "bot" ? bot : user,
    chat,
    date: Math.floor(Date.now() / 1000),
    ...(message.text ? { text: message.text } : {})
  })
  const enqueue = (update: Record<string, unknown>) => {
    updates.push({ update_id: nextUpdateId++, ...update })
    for (const wake of waiters.splice(0)) wake()
  }
  const findMessage = (id: unknown) => messages.find(message => message.id === Number(id))

  async function params(request: Request): Promise<Record<string, unknown>> {
    const type = request.headers.get("content-type") ?? ""
    if (type.includes("multipart/form-data")) {
      const out: Record<string, unknown> = {}
      for (const [key, value] of await request.formData()) out[key] = value
      return out
    }
    if (type.includes("json")) return (await request.json()) as Record<string, unknown>
    return Object.fromEntries(new URL(request.url).searchParams)
  }
  // JSON bodies carry nested objects; multipart carries them as JSON text
  const nested = <T>(value: unknown): T | undefined => (typeof value === "string" ? JSON.parse(value) : (value as T))
  const buttonsOf = (markup: unknown): Button[][] =>
    nested<{ inline_keyboard?: Button[][] }>(markup)?.inline_keyboard ?? []

  async function storePhoto(body: Record<string, unknown>): Promise<string> {
    // An upload comes as `attach://<name>` pointing at another form part
    const field = body.photo
    const photo =
      typeof field === "string" && field.startsWith("attach://") ? body[field.slice("attach://".length)] : field
    if (photo instanceof Blob) {
      const id = `photo-${nextFileId++}`
      files.set(id, { bytes: new Uint8Array(await photo.arrayBuffer()), mime: photo.type || "image/jpeg" })
      return `/files/${id}`
    }
    return String(photo)
  }

  async function method(name: string, body: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "getMe":
        return bot
      case "deleteWebhook":
      case "setMyCommands":
      case "sendChatAction":
      case "answerCallbackQuery":
        return true
      case "getUpdates": {
        const offset = Number(body.offset ?? 0)
        while (updates.length && updates[0]!.update_id < offset) updates.shift()
        if (updates.length === 0) {
          const seconds = Math.min(Number(body.timeout ?? 0), 20)
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, seconds * 1000)
            waiters.push(() => {
              clearTimeout(timer)
              resolve()
            })
          })
        }
        return updates.filter(update => update.update_id >= offset)
      }
      case "sendMessage": {
        const message: StoredMessage = {
          id: nextMessageId++,
          from: "bot",
          text: String(body.text),
          buttons: buttonsOf(body.reply_markup)
        }
        messages.push(message)
        return wire(message)
      }
      case "sendPhoto": {
        const message: StoredMessage = {
          id: nextMessageId++,
          from: "bot",
          text: "",
          caption: body.caption ? String(body.caption) : undefined,
          photo: await storePhoto(body),
          buttons: []
        }
        messages.push(message)
        return { ...wire(message), caption: message.caption }
      }
      case "editMessageText": {
        const message = findMessage(body.message_id)
        if (!message) throw new Error("message to edit not found")
        if (
          message.text === String(body.text) &&
          JSON.stringify(message.buttons) === JSON.stringify(buttonsOf(body.reply_markup))
        )
          throw new Error(
            "Bad Request: message is not modified: specified new message content and reply markup are exactly the same"
          )
        message.text = String(body.text)
        message.buttons = buttonsOf(body.reply_markup)
        return wire(message)
      }
      case "editMessageCaption": {
        const message = findMessage(body.message_id)
        if (!message) throw new Error("message to edit not found")
        if (message.caption === String(body.caption))
          throw new Error(
            "Bad Request: message is not modified: specified new message content and reply markup are exactly the same"
          )
        message.caption = String(body.caption)
        return wire(message)
      }
      case "deleteMessage": {
        const message = findMessage(body.message_id)
        if (message) message.deleted = true
        return true
      }
      case "getFile":
        return { file_id: body.file_id, file_unique_id: String(body.file_id), file_path: `photos/${body.file_id}` }
      default:
        throw new Error(`The fake Bot API has no ${name}`)
    }
  }

  const reply = (json: unknown, status = 200) => Response.json(json, { status })

  const server = Bun.serve({
    port: e2eEnv.E2E_TELEGRAM_PORT,
    hostname: "127.0.0.1",
    idleTimeout: 60,
    async fetch(request) {
      const url = new URL(request.url)
      const api = /^\/bot[^/]+\/(\w+)$/.exec(url.pathname)
      if (api) {
        try {
          return reply({ ok: true, result: await method(api[1]!, await params(request)) })
        } catch (error) {
          const description = (error as Error).message
          return reply({ ok: false, error_code: 400, description }, 400)
        }
      }
      const download = /^\/file\/bot[^/]+\/photos\/(.+)$/.exec(url.pathname) ?? /^\/files\/(.+)$/.exec(url.pathname)
      if (download) {
        const file = files.get(download[1]!)
        return file
          ? new Response(file.bytes, { headers: { "content-type": file.mime } })
          : new Response("no file", { status: 404 })
      }
      if (url.pathname === "/state") {
        return reply(messages.filter(message => !message.deleted))
      }
      if (url.pathname === "/user/message" && request.method === "POST") {
        const { text, group } = (await request.json()) as { text: string; group?: boolean }
        const message: StoredMessage = { id: nextMessageId++, from: "user", text, buttons: [] }
        // A group's messages never appear in the private chat window
        if (!group) messages.push(message)
        const command = text.startsWith("/")
          ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] }
          : {}
        const where = group ? { chat: { id: -1001, type: "supergroup", title: "Friends" } } : {}
        enqueue({ message: { ...wire(message), ...where, ...command } })
        return reply(true)
      }
      if (url.pathname === "/user/photo" && request.method === "POST") {
        const { data, mime, caption } = (await request.json()) as { data: string; mime: string; caption?: string }
        const bytes = Uint8Array.fromBase64(data)
        const id = `photo-${nextFileId++}`
        files.set(id, { bytes, mime })
        const message: StoredMessage = {
          id: nextMessageId++,
          from: "user",
          text: "",
          caption,
          photo: `/files/${id}`,
          buttons: []
        }
        messages.push(message)
        enqueue({
          message: {
            ...wire(message),
            ...(caption ? { caption } : {}),
            photo: [{ file_id: id, file_unique_id: id, width: 100, height: 100, file_size: bytes.byteLength }]
          }
        })
        return reply(true)
      }
      if (url.pathname === "/user/callback" && request.method === "POST") {
        const { messageId, data } = (await request.json()) as { messageId: number; data?: string }
        const message = findMessage(messageId)
        if (message && data)
          enqueue({
            callback_query: { id: String(nextUpdateId), from: user, message: wire(message), chat_instance: "e2e", data }
          })
        return reply(true)
      }
      if (url.pathname === "/") return new Response(CHAT_PAGE, { headers: { "content-type": "text/html" } })
      return new Response("not found", { status: 404 })
    }
  })

  const botMessages = (): BotMessage[] =>
    messages
      .filter(message => message.from === "bot" && !message.deleted)
      .map(message => {
        const html = message.text || message.caption || ""
        return {
          id: message.id,
          text: html,
          plain: stripTags(html),
          ...(message.photo ? { photo: message.photo } : {}),
          buttons: message.buttons.flat().map(button => button.text)
        }
      })

  async function waitForBot(
    match: string | RegExp,
    { after = 0, timeoutMs = 60_000 }: { after?: number; timeoutMs?: number } = {}
  ): Promise<BotMessage> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = botMessages().find(
        message =>
          message.id > after && (typeof match === "string" ? message.plain.includes(match) : match.test(message.plain))
      )
      if (found) return found
      await Bun.sleep(200)
    }
    throw new Error(
      `The bot never said ${match} within ${timeoutMs} ms. It said:\n${botMessages()
        .map(m => `  ${m.plain}`)
        .join("\n")}`
    )
  }

  const say = async (page: Page, text: string) => {
    await page.locator("#input").fill(text)
    await page.locator("#send").click()
  }

  return {
    apiRoot: `http://127.0.0.1:${server.port}`,
    url: `http://127.0.0.1:${server.port}`,
    botMessages,
    say,
    async sayInGroup(text) {
      await fetch(`http://127.0.0.1:${server.port}/user/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, group: true })
      })
    },
    async openLink(page, link) {
      const token = new URL(link).searchParams.get("start")
      if (!token) throw new Error(`No start token in ${link}`)
      await say(page, `/start ${token}`)
    },
    async attachImage(page, file, caption) {
      if (caption) await page.locator("#input").fill(caption)
      await page.locator("#file").setInputFiles(file)
    },
    async press(page, label) {
      await page.locator(".msg:has(.btn)").last().getByRole("button", { name: label }).click()
    },
    waitForBot,
    async waitForPhoto(after, timeoutMs = 90_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const found = botMessages().find(message => message.id > after && message.photo)
        if (found) return found
        await Bun.sleep(200)
      }
      throw new Error(
        `The bot sent no photo within ${timeoutMs} ms. It said:\n${botMessages()
          .map(m => `  ${m.plain}`)
          .join("\n")}`
      )
    },
    async fetchPhoto(message) {
      if (!message.photo) throw new Error("That message has no photo")
      const response = await fetch(
        message.photo.startsWith("/") ? `http://127.0.0.1:${server.port}${message.photo}` : message.photo
      )
      if (!response.ok) throw new Error(`The photo ${message.photo} answered ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    },
    reset() {
      messages.length = 0
      updates.length = 0
      userId += 1
      user = { ...user, id: userId }
      chat = { ...chat, id: userId }
    },
    waitForReply(after, timeoutMs) {
      return waitForBot(/[\p{L}\p{N}]/u, { after, timeoutMs })
    },
    async stop() {
      await server.stop(true)
    }
  }
}
