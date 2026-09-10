import { info as logInfo } from "@kaja/logger"
import { env } from "../../core/env"
import { createCloudTelegramBot } from "./bot"

let bot: ReturnType<typeof createCloudTelegramBot> | undefined

/** The linked bot's @username, once start() has resolved — used to build the t.me deep link. Undefined if the bot isn't configured/started yet. */
export function getBotUsername(): string | undefined {
  return bot?.getUsername()
}

/**
 * Always-on cloud Telegram bot: opt-in via TELEGRAM_BOT_TOKEN. Every
 * Telegram user links their own Kaja account via a one-time deep link
 * (see bot.ts's /start handler and features/telegram-admin) — there's no
 * shared account and no allowedUserIds. Returns undefined when the token
 * is unset.
 */
export function createTelegramBotService() {
  if (!env.TELEGRAM_BOT_TOKEN) return undefined
  const instance = createCloudTelegramBot({ botToken: env.TELEGRAM_BOT_TOKEN })
  bot = instance

  return {
    async start() {
      await instance.start()
      logInfo("Telegram bot ready, long-polling for messages")
    },
    stop: instance.stop
  }
}
