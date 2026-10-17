import type { CliResolvedModel } from "@kaja/schema/config"
import {
  albumCollector,
  asRateLimitError,
  downloadTelegramImage,
  incomingImage,
  isNotModifiedError,
  TELEGRAM_IMAGE_LIMIT,
  withRateLimitRetry
} from "@kaja/shared/telegram"
import { Bot, GrammyError, InlineKeyboard, InputFile } from "grammy"
import type { Agent } from "../agent/agents"
import { t } from "../i18n"
import { log } from "../logger"
import type { Persona } from "../personas/personas"
import { createTelegramDriver, type InlineKeyboardLike } from "./driver"
import { createPairing, generatePairingCode } from "./pairing"

/** Runs a driver call without holding up grammy's update loop; anything it doesn't handle itself is logged, never left an unhandled rejection. */
function inBackground(work: Promise<unknown>) {
  work.catch(error => log.error("Telegram update handling crashed", { error }))
}

export type CreateTelegramBotConfig = {
  botToken: string
  /** Telegram user ids allowed to talk to the bot (secrets.toml `owner_ids`). */
  ownerIds: number[]
  /** Opens pairing even with owners (`kaja telegram --pair`); with none it's always open. */
  pair?: boolean
  /** Saves a newly paired user; the bot has already let them in. */
  onPaired?: (user: { id: number; name: string }) => Promise<void>
  agentConfig: ConstructorParameters<typeof Agent>[0]
  personas: Persona[]
  models: CliResolvedModel[]
  getInitialPersona?: () => Persona | undefined | Promise<Persona | undefined>
}

function buildKeyboard(keyboard: InlineKeyboardLike | undefined) {
  return keyboard ? new InlineKeyboard(keyboard) : undefined
}

/** What grammy's sendPhoto takes: a tool's bytes, a file on this computer (a reply's Markdown image), or a URL it fetches. */
function photoInput(photo: { data: Uint8Array } | { path: string } | { url: string }) {
  if ("data" in photo) return new InputFile(photo.data)
  if ("path" in photo) return new InputFile(photo.path)
  return photo.url
}

/**
 * The only grammy-aware file: constructs the Bot, implements
 * lib/telegram-driver.ts's TelegramSender against bot.api, wires update
 * handlers to the driver, and owns startup validation (getMe preflight) and
 * shutdown (bot.stop()). lib/telegram-driver.ts itself never imports grammy.
 */
export function createTelegramBot(config: CreateTelegramBotConfig) {
  const bot = new Bot(config.botToken)
  const pairing = createPairing({
    ownerIds: config.ownerIds,
    code: config.pair || config.ownerIds.length === 0 ? generatePairingCode() : undefined
  })

  const driver = createTelegramDriver({
    agentConfig: config.agentConfig,
    personas: config.personas,
    models: config.models,
    getInitialPersona: config.getInitialPersona,
    sender: {
      async sendMessage(chatId, text, opts) {
        const message = await withRateLimitRetry(() =>
          bot.api.sendMessage(chatId, text, {
            parse_mode: "HTML",
            reply_markup: buildKeyboard(opts?.replyMarkup)
          })
        )
        return { messageId: message.message_id }
      },
      async editMessageText(chatId, messageId, text, opts) {
        try {
          await bot.api.editMessageText(chatId, messageId, text, {
            parse_mode: "HTML",
            reply_markup: buildKeyboard(opts?.replyMarkup)
          })
        } catch (error) {
          if (isNotModifiedError(error)) return
          const rateLimit = asRateLimitError(error)
          if (rateLimit) throw rateLimit
          throw error
        }
      },
      async deleteMessage(chatId, messageId) {
        await bot.api.deleteMessage(chatId, messageId)
      },
      async answerCallbackQuery(callbackQueryId, opts) {
        await bot.api.answerCallbackQuery(callbackQueryId, { text: opts?.text })
      },
      async sendPhoto(chatId, photo, opts) {
        const input = photoInput(photo)
        const message = await withRateLimitRetry(() =>
          bot.api.sendPhoto(chatId, input, opts?.caption ? { caption: opts.caption } : undefined)
        )
        return { messageId: message.message_id }
      },
      async editCaption(chatId, messageId, caption) {
        try {
          await withRateLimitRetry(() => bot.api.editMessageCaption(chatId, messageId, { caption }))
        } catch (error) {
          if (!isNotModifiedError(error)) throw error
        }
      }
    }
  })

  // Private chats only: in a group, the chat's messages and buttons would mix several people's conversations
  const chat = bot.chatType("private")

  type IncomingPhoto = { userId: number; chatId: number; caption: string; image: { fileId: string; mimeType: string } }

  /** An image message, or a whole album, as one turn; the photos download here, never in grammy's update loop. */
  async function handlePhotos(photos: IncomingPhoto[]) {
    const { userId, chatId } = photos[0]!
    const caption = photos
      .map(photo => photo.caption)
      .filter(Boolean)
      .join("\n")
    let dataUrls: string[]
    try {
      dataUrls = await Promise.all(
        photos.map(photo => downloadTelegramImage(config.botToken, fileId => bot.api.getFile(fileId), photo.image))
      )
    } catch (error) {
      log.warn("Telegram photo download failed", { error })
      await bot.api.sendMessage(chatId, t("telegram.photoFailed"))
      return
    }
    await driver.handleMessage(userId, chatId, caption, dataUrls)
  }

  const addPhoto = albumCollector<IncomingPhoto>(photos => inBackground(handlePhotos(photos)))

  // Strangers get no reply at all, so the bot doesn't even confirm it's running.
  chat.on("message:text", async ctx => {
    const verdict = pairing.check(ctx.from.id, ctx.message.text)
    if (verdict === "owner") {
      inBackground(driver.handleMessage(ctx.from.id, ctx.chat.id, ctx.message.text))
      return
    }
    if (verdict !== "paired") return
    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ")
    console.log(t("telegram.pairedLog", { name, id: ctx.from.id }))
    await config.onPaired?.({ id: ctx.from.id, name })
    await ctx.reply(t("telegram.paired"))
  })

  // A photo (or an image sent as a file) goes to the model with its caption as the text, an album's photos together; owners only, like everything else
  chat.on(["message:photo", "message:document"], async ctx => {
    if (!pairing.isOwner(ctx.from.id)) return
    const image = incomingImage(ctx.message)
    if (!image) return
    if ((image.size ?? 0) > TELEGRAM_IMAGE_LIMIT) {
      await ctx.reply(t("telegram.photoTooLarge"))
      return
    }
    const group = ctx.message.media_group_id
    addPhoto(group && `${ctx.chat.id}:${group}`, {
      userId: ctx.from.id,
      chatId: ctx.chat.id,
      caption: ctx.message.caption ?? "",
      image
    })
  })

  chat.on("callback_query:data", ctx => {
    if (!pairing.isOwner(ctx.from.id)) return
    const chatId = ctx.callbackQuery.message?.chat.id
    const messageId = ctx.callbackQuery.message?.message_id
    if (chatId === undefined || messageId === undefined) return
    inBackground(
      driver.handleCallbackQuery(ctx.from.id, chatId, messageId, ctx.callbackQuery.data, ctx.callbackQuery.id)
    )
  })

  bot.catch(err => {
    // A 401 here (unlike at the getMe() preflight in start()) means the token was revoked mid-session — every future API call will fail the same way, including the generic-error sendMessage below, so that failure would otherwise go completely silent. Log it distinctly so an operator watching logs can tell "bot is dead" apart from one bad update.
    if (err.error instanceof GrammyError && err.error.error_code === 401) {
      log.error("Telegram bot token rejected — bot is now unreachable", { error: err.error })
      return
    }
    log.error("Unhandled error in Telegram update handler", { error: err.error })
    const chatId = err.ctx.chat?.id
    if (chatId !== undefined) bot.api.sendMessage(chatId, t("telegram.genericError")).catch(() => {})
  })

  return {
    async start() {
      try {
        await bot.api.getMe()
      } catch (error) {
        throw new Error(t("telegram.invalidToken"), { cause: error })
      }
      // The menu next to the message box; a failure only costs the menu.
      await bot.api
        .setMyCommands([
          { command: "new", description: t("telegram.commandNew") },
          { command: "compact", description: t("telegram.commandCompact") },
          { command: "abilities", description: t("telegram.commandAbilities") }
        ])
        .catch(error => log.warn("Telegram command menu not set", { error }))
      await bot.start({
        onStart: botInfo => {
          if (pairing.code) {
            const key = config.ownerIds.length === 0 ? "telegram.pairFirst" : "telegram.pairAnother"
            console.log(t(key, { username: botInfo.username, code: pairing.code }))
          }
          console.log(t("telegram.ready"))
        }
      })
    },
    async stop() {
      await bot.stop()
    }
  }
}
