import type { Locale } from "@kaja/shared"
import {
  asRateLimitError,
  downloadTelegramImage,
  incomingImage,
  isNotModifiedError,
  TELEGRAM_IMAGE_LIMIT,
  withRateLimitRetry
} from "@kaja/shared"
import { Bot, GrammyError, InlineKeyboard } from "grammy"
import type { LanguageCode } from "grammy/types"
import { translator } from "../../core/i18n"
import { reportError } from "../../core/report"
import { telegramLinkService } from "../../services"
import { createCloudTelegramDriver, type TelegramButton } from "./driver"
import { botLanguage } from "./language"

/** Callback data is capped at 64 bytes by the Bot API; "link:confirm:" (13) + a 24-char base64url token fits comfortably. */
function linkCallbackData(action: "confirm" | "cancel", token: string): string {
  return `link:${action}:${token}`
}

export type CreateCloudTelegramBotConfig = {
  botToken: string
}

/** Rows of inline buttons, or undefined for none. */
function keyboardFor(rows: TelegramButton[][] | undefined): InlineKeyboard | undefined {
  if (!rows?.length) return undefined
  return new InlineKeyboard(rows.map(row => row.map(button => InlineKeyboard.text(button.text, button.data))))
}

/** How long to wait before polling again while another instance holds the getUpdates connection. */
const POLL_CONFLICT_RETRY_MS = 10_000

/** The Telegram app language each translated command menu is for; nan-TW has no two-letter code, so it gets the default (English) one. */
const MENU_LANGUAGE: [Locale, LanguageCode][] = [
  ["hu-HU", "hu"],
  ["zh-TW", "zh"]
]

/** The command menu Telegram shows next to the message box, in one language. */
function commandsIn(locale: Locale) {
  const t = translator(locale)
  return [
    { command: "new", description: t("telegram.commandNew") },
    { command: "compact", description: t("telegram.commandCompact") },
    { command: "abilities", description: t("telegram.commandAbilities") }
  ]
}

/**
 * The only grammy-aware file: constructs the Bot, implements driver.ts's
 * TelegramSender against bot.api, wires the message and callback handlers,
 * and owns startup validation (getMe preflight) and shutdown (bot.stop()).
 * Inline keyboards serve the account-link confirm/cancel flow below and the
 * driver's tool approvals (`tool:*` callbacks); the driver never imports grammy.
 */
export function createCloudTelegramBot(config: CreateCloudTelegramBotConfig) {
  const bot = new Bot(config.botToken)

  const driver = createCloudTelegramDriver({
    resolveLinkedUser: telegramUserId => telegramLinkService.resolveUser(telegramUserId),
    sender: {
      async sendMessage(chatId, text, rows) {
        const message = await withRateLimitRetry(() =>
          bot.api.sendMessage(chatId, text, {
            parse_mode: "HTML",
            reply_markup: keyboardFor(rows)
          })
        )
        return { messageId: message.message_id }
      },
      async editMessageText(chatId, messageId, text, rows) {
        try {
          await bot.api.editMessageText(chatId, messageId, text, {
            parse_mode: "HTML",
            reply_markup: keyboardFor(rows) ?? { inline_keyboard: [] }
          })
        } catch (error) {
          if (isNotModifiedError(error)) return
          const rateLimit = asRateLimitError(error)
          if (rateLimit) throw rateLimit
          throw error
        }
      },
      async sendPhoto(chatId, url, caption) {
        await withRateLimitRetry(() => bot.api.sendPhoto(chatId, url, caption ? { caption } : undefined))
      }
    }
  })

  bot.command("start", async ctx => {
    if (!ctx.from) return
    const token = ctx.match
    // Before linking, the only language known is the Telegram app's; the account being linked has its own saved one.
    if (!token) {
      await ctx.reply(botLanguage(null, ctx.from.language_code).t("telegram.startWithoutLink"))
      return
    }

    const pending = await telegramLinkService.peekLinkToken(token)
    if (!pending) {
      await ctx.reply(botLanguage(null, ctx.from.language_code).t("telegram.linkExpired"))
      return
    }

    const { t } = botLanguage(pending.locale, ctx.from.language_code)
    const keyboard = new InlineKeyboard()
      .text(t("telegram.linkConfirm"), linkCallbackData("confirm", token))
      .text(t("telegram.linkCancel"), linkCallbackData("cancel", token))
    await ctx.reply(t("telegram.linkQuestion", { email: pending.email }), {
      parse_mode: "HTML",
      reply_markup: keyboard
    })
  })

  bot.on("callback_query:data", async ctx => {
    const message = ctx.callbackQuery.message
    if (/^(tool|ability|abilitypage):/.test(ctx.callbackQuery.data) && message) {
      await ctx.answerCallbackQuery()
      void driver.handleCallback(
        ctx.from.id,
        message.chat.id,
        message.message_id,
        ctx.callbackQuery.data,
        ctx.from.language_code
      )
      return
    }

    const match = /^link:(confirm|cancel):(.+)$/.exec(ctx.callbackQuery.data)
    if (!match) return
    await ctx.answerCallbackQuery()

    const action = match[1] as "confirm" | "cancel"
    const token = match[2]!
    const pending = await telegramLinkService.peekLinkToken(token)
    const { t } = botLanguage(pending?.locale, ctx.from.language_code)

    if (action === "cancel") {
      await telegramLinkService.deleteLinkToken(token)
      await ctx.editMessageText(t("telegram.linkCancelled"))
      return
    }

    if (!pending) {
      await ctx.editMessageText(t("telegram.linkHandled"))
      return
    }

    const deleted = await telegramLinkService.deleteLinkToken(token)
    if (!deleted) {
      await ctx.editMessageText(t("telegram.linkHandled"))
      return
    }

    const linked = await telegramLinkService.link(ctx.from.id, pending.userId)
    await ctx.editMessageText(linked ? t("telegram.linked", { email: pending.email }) : t("telegram.linkedElsewhere"), {
      parse_mode: "HTML"
    })
  })

  bot.on("message:text", ctx => {
    void driver.handleMessage(ctx.from.id, ctx.chat.id, ctx.message.text, ctx.from.language_code)
  })

  // A photo (or an image sent as a file) goes to the model with its caption as the text
  bot.on(["message:photo", "message:document"], async ctx => {
    const image = incomingImage(ctx.message)
    if (!image) return
    const caption = ctx.message.caption ?? ""
    // An unlinked sender only gets the "link your account" reply; their photo is never downloaded
    const linked = await telegramLinkService.resolveUser(ctx.from.id)
    if (!linked) {
      void driver.handleMessage(ctx.from.id, ctx.chat.id, caption, ctx.from.language_code)
      return
    }
    const { t } = botLanguage(linked.locale, ctx.from.language_code)
    if ((image.size ?? 0) > TELEGRAM_IMAGE_LIMIT) {
      await ctx.reply(t("telegram.photoTooLarge"))
      return
    }
    let dataUrl: string
    try {
      dataUrl = await downloadTelegramImage(config.botToken, fileId => bot.api.getFile(fileId), image)
    } catch (error) {
      reportError("Telegram photo download failed", error)
      await ctx.reply(t("telegram.photoFailed"))
      return
    }
    void driver.handleMessage(ctx.from.id, ctx.chat.id, caption, ctx.from.language_code, [dataUrl])
  })

  bot.catch(err => {
    if (err.error instanceof GrammyError && err.error.error_code === 401) {
      reportError("Telegram bot token rejected — bot is now unreachable", err.error)
      return
    }
    reportError("Unhandled error in Telegram update handler", err.error)
  })

  let username: string | undefined
  let stopped = false

  // Long polling; a 409 means another instance still polls (the previous container during a deploy, or a dev machine on the same token), so wait for it to let go.
  async function poll(): Promise<void> {
    let warned = false
    while (!stopped) {
      try {
        await bot.start()
        return
      } catch (error) {
        if (!(error instanceof GrammyError && error.error_code === 409)) throw error
        if (!warned) console.warn("Telegram bot: another instance is polling with this token, retrying")
        warned = true
        await Bun.sleep(POLL_CONFLICT_RETRY_MS)
      }
    }
  }

  return {
    async start() {
      try {
        username = (await bot.api.getMe()).username
      } catch (error) {
        throw new Error("Invalid Telegram bot token — check TELEGRAM_BOT_TOKEN.", { cause: error })
      }
      // The menu next to the message box, per Telegram app language (English by default); a failure only costs the menu.
      const menus = [
        bot.api.setMyCommands(commandsIn("en-GB")),
        ...MENU_LANGUAGE.map(([locale, code]) => bot.api.setMyCommands(commandsIn(locale), { language_code: code }))
      ]
      await Promise.all(menus).catch(error => reportError("Telegram command menu not set", error))
      poll().catch(error => reportError("Telegram bot stopped polling", error))
    },
    async stop() {
      stopped = true
      await bot.stop()
    },
    /** Set once start() has resolved the getMe() preflight; undefined before that. */
    getUsername: () => username
  }
}
