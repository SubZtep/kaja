import { expect, mock, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// telegram-bot.ts -> telegram-driver.ts -> lib/agents.ts -> lib/openai.ts,
// which reads config() at module load — config() hard-exits the process if
// config.json is missing or its chat model doesn't resolve in models.toml,
// so this isolated config dir needs both (same fixture as
// tests/lib/agents.test.ts). Set before the dynamic import below so it's in
// place before lib/openai.ts is ever evaluated.
const configDir = `${tmpdir()}/kaja-test-xdg-config-telegram-bot`
process.env.XDG_CONFIG_HOME = configDir
const configKajaDir = join(configDir, "kaja")
mkdirSync(configKajaDir, { recursive: true })
writeFileSync(
  join(configKajaDir, "config.json"),
  JSON.stringify({
    models: { chat: "chat-default" }
  })
)
writeFileSync(
  join(configKajaDir, "models.toml"),
  `
[providers.default]
base_url = "http://localhost"
api_key = "x"

[[models]]
id = "chat-default"
model = "x"
task = "chat"
`
)

// telegram-bot.ts is the one grammy-aware module, so its own test mocks
// grammy's Bot rather than hitting the real Telegram API — mirrors how
// tests/lib/telegram-driver.test.ts stays grammy-free by testing against a
// fake TelegramSender instead.
const sendMessage = mock(async (_chatId: number, _text: string) => ({
  message_id: 1
}))
const getMe = mock(async () => ({ id: 1, is_bot: true, first_name: "bot" }))
let onStartHandler: (() => void) | undefined

mock.module("grammy", () => ({
  Bot: class {
    api = { getMe, sendMessage }
    on() {}
    catch() {}
    async start(opts?: { onStart?: () => void }) {
      onStartHandler = opts?.onStart
      onStartHandler?.()
    }
    async stop() {}
  },
  GrammyError: class extends Error {},
  InlineKeyboard: class {},
  InputFile: class {}
}))

const { createTelegramBot } = await import("../../lib/telegram-bot")
const { t } = await import("../../lib/i18n")

function makeBot(allowedUserIds: number[]) {
  return createTelegramBot({
    botToken: "token",
    allowedUserIds,
    agentConfig: { model: "m", tools: [] },
    personas: [],
    models: []
  })
}

test("start() notifies every allowed user that the bot is online", async () => {
  sendMessage.mockClear()
  const bot = makeBot([111, 222])
  await bot.start()
  expect(sendMessage).toHaveBeenCalledTimes(2)
  expect(sendMessage).toHaveBeenCalledWith(111, t("telegram.botOnline"))
  expect(sendMessage).toHaveBeenCalledWith(222, t("telegram.botOnline"))
})

test("stop() notifies every allowed user that the bot is going offline", async () => {
  sendMessage.mockClear()
  const bot = makeBot([333])
  await bot.stop()
  expect(sendMessage).toHaveBeenCalledTimes(1)
  expect(sendMessage).toHaveBeenCalledWith(333, t("telegram.botOffline"))
})

test("a rejected send for one user doesn't stop others from being notified", async () => {
  sendMessage.mockClear()
  sendMessage.mockImplementationOnce(async () => {
    throw new Error("blocked by user")
  })
  const bot = makeBot([444, 555])
  await bot.start()
  expect(sendMessage).toHaveBeenCalledTimes(2)
})
