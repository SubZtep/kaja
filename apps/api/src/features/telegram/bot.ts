import { error as logError } from "@kaja/logger"
import { Bot, GrammyError } from "grammy"
import { telegramLinkService } from "../../services"
import { createCloudTelegramDriver, TelegramRateLimitError } from "./driver"

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
 * startup validation (getMe preflight) and shutdown (bot.stop()). No
 * callback_query handler — cloud Nasi never emits confirm_command, so no
 * inline keyboard is ever sent. driver.ts itself never imports grammy.
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

    const userId = await telegramLinkService.consumeLinkToken(token)
    if (!userId) {
      await ctx.reply("That link has expired or was already used. Generate a new one from your Kaja profile.")
      return
    }

    const linked = await telegramLinkService.link(ctx.from.id, userId)
    await ctx.reply(
      linked
        ? "✅ Linked to your Kaja account. Send a message to start chatting."
        : "This Telegram account is already linked to a different Kaja account."
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
