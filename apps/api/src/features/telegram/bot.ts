import { error as logError } from "@kaja/logger"
import { Bot, GrammyError, InlineKeyboard } from "grammy"
import { telegramLinkService } from "../../services"
import { createCloudTelegramDriver, TelegramRateLimitError } from "./driver"

/** Callback data is capped at 64 bytes by the Bot API; "link:confirm:" (13) + a 24-char base64url token fits comfortably. */
function linkCallbackData(action: "confirm" | "cancel", token: string): string {
  return `link:${action}:${token}`
}

export type CreateCloudTelegramBotConfig = {
  botToken: string
}

/** Telegram's "message is not modified" 400 is an expected race (see EditThrottle's own dedupe guard), not an error. */
function isNotModifiedError(error: unknown): boolean {
  return (
    error instanceof GrammyError && error.error_code === 400 && error.description.includes("message is not modified")
  )
}

function asRateLimitError(error: unknown): TelegramRateLimitError | undefined {
  if (error instanceof GrammyError && error.error_code === 429)
    return new TelegramRateLimitError(error.parameters.retry_after)
  return undefined
}

async function withRateLimitRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send()
  } catch (error) {
    const rateLimit = asRateLimitError(error)
    if (!rateLimit?.retryAfterSec) throw error
    await Bun.sleep(rateLimit.retryAfterSec * 1000)
    return send()
  }
}

/**
 * The only grammy-aware file: constructs the Bot, implements driver.ts's
 * TelegramSender against bot.api, wires the message handler, and owns
 * startup validation (getMe preflight) and shutdown (bot.stop()). The only
 * inline keyboard/callback_query use is the account-link confirm/cancel
 * flow below — cloud Nasi itself never emits confirm_command, so the chat
 * turn loop in driver.ts never needs one and never imports grammy.
 */
export function createCloudTelegramBot(config: CreateCloudTelegramBotConfig) {
  const bot = new Bot(config.botToken)

  const driver = createCloudTelegramDriver({
    resolveLinkedUserId: telegramUserId => telegramLinkService.resolveUserId(telegramUserId),
    sender: {
      async sendMessage(chatId, text) {
        const message = await withRateLimitRetry(() => bot.api.sendMessage(chatId, text, { parse_mode: "HTML" }))
        return { messageId: message.message_id }
      },
      async editMessageText(chatId, messageId, text) {
        try {
          await bot.api.editMessageText(chatId, messageId, text, { parse_mode: "HTML" })
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
        'Hi! To use this bot, connect your Kaja account first — go to your profile on the Kaja web app and tap "Connect Telegram" to get a link.'
      )
      return
    }

    const pending = await telegramLinkService.peekLinkToken(token)
    if (!pending) {
      await ctx.reply("That link has expired or was already used. Generate a new one from your Kaja profile.")
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
      logError("Telegram bot token rejected — bot is now unreachable", { error: err.error })
      return
    }
    logError("Unhandled error in Telegram update handler", { error: err.error })
  })

  let username: string | undefined

  return {
    async start() {
      try {
        username = (await bot.api.getMe()).username
      } catch (error) {
        throw new Error("Invalid Telegram bot token — check TELEGRAM_BOT_TOKEN.", { cause: error })
      }
      void bot.start()
    },
    async stop() {
      await bot.stop()
    },
    /** Set once start() has resolved the getMe() preflight; undefined before that. */
    getUsername: () => username
  }
}
