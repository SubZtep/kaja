import { asRateLimitError, isNotModifiedError, withRateLimitRetry } from "@kaja/shared"
import { Bot, GrammyError, InlineKeyboard } from "grammy"
import { reportError } from "../../core/report"
import { telegramLinkService } from "../../services"
import { createCloudTelegramDriver, type TelegramButton } from "./driver"

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

/** The command menu Telegram shows next to the message box. */
const COMMANDS = [
  { command: "new", description: "Start a new conversation" },
  { command: "abilities", description: "Turn skills and tools on or off" }
]

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
    resolveLinkedUserId: telegramUserId => telegramLinkService.resolveUserId(telegramUserId),
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
      }
    }
  })

  bot.command("start", async ctx => {
    if (!ctx.from) return
    const token = ctx.match
    if (!token) {
      await ctx.reply(
        'Hi! To use this bot, connect your Kaja account first — go to your dashboard on the Kaja web app and tap "Get Telegram link".'
      )
      return
    }

    const pending = await telegramLinkService.peekLinkToken(token)
    if (!pending) {
      await ctx.reply("That link has expired or was already used. Generate a new one from your Kaja dashboard.")
      return
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Confirm", linkCallbackData("confirm", token))
      .text("❌ Cancel", linkCallbackData("cancel", token))
    await ctx.reply(`Link this Telegram account to <b>${pending.email}</b>?`, {
      parse_mode: "HTML",
      reply_markup: keyboard
    })
  })

  bot.on("callback_query:data", async ctx => {
    const message = ctx.callbackQuery.message
    if (/^(tool|ability|abilitypage):/.test(ctx.callbackQuery.data) && message) {
      await ctx.answerCallbackQuery()
      void driver.handleCallback(ctx.from.id, message.chat.id, message.message_id, ctx.callbackQuery.data)
      return
    }

    const match = /^link:(confirm|cancel):(.+)$/.exec(ctx.callbackQuery.data)
    if (!match) return
    await ctx.answerCallbackQuery()

    const action = match[1] as "confirm" | "cancel"
    const token = match[2]!

    if (action === "cancel") {
      await telegramLinkService.deleteLinkToken(token)
      await ctx.editMessageText("Cancelled — no link was made.")
      return
    }

    const pending = await telegramLinkService.peekLinkToken(token)
    if (!pending) {
      await ctx.editMessageText("This link was already handled or has expired.")
      return
    }

    const deleted = await telegramLinkService.deleteLinkToken(token)
    if (!deleted) {
      await ctx.editMessageText("This link was already handled or has expired.")
      return
    }

    const linked = await telegramLinkService.link(ctx.from.id, pending.userId)
    await ctx.editMessageText(
      linked
        ? `✅ Linked to your Kaja account (<b>${pending.email}</b>). Send a message to start chatting.`
        : "This Telegram account is already linked to a different Kaja account.",
      { parse_mode: "HTML" }
    )
  })

  bot.on("message:text", ctx => {
    void driver.handleMessage(ctx.from.id, ctx.chat.id, ctx.message.text)
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
      // The menu next to the message box; a failure only costs the menu.
      await bot.api.setMyCommands(COMMANDS).catch(error => reportError("Telegram command menu not set", error))
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
