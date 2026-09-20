import { expect, mock, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// telegram-bot.ts -> telegram-driver.ts -> lib/agents.ts -> lib/openai.ts, which reads config() at module load — config() hard-exits the process if settings.toml is missing or its chat model doesn't resolve in models.toml, so this isolated config dir needs both (same fixture as tests/lib/agents.test.ts). Set before the dynamic import below so it's in place before lib/openai.ts is ever evaluated.
const configDir = `${tmpdir()}/kaja-test-xdg-config-telegram-bot`
process.env.XDG_CONFIG_HOME = configDir
const configKajaDir = join(configDir, "kaja")
mkdirSync(configKajaDir, { recursive: true })
writeFileSync(join(configKajaDir, "settings.toml"), "")
writeFileSync(
  join(configKajaDir, "models.toml"),
  `
[providers.default]
base_url = "http://localhost"
api_key = "x"

[models.chat]
model = "x"
task = "chat"
provider = "default"
`
)

// telegram-bot.ts is the one grammy-aware module, so its own test mocks grammy's Bot rather than hitting the real Telegram API — mirrors how tests/lib/telegram-driver.test.ts stays grammy-free by testing against a fake TelegramSender instead.
const sendMessage = mock(async (_chatId: number, _text: string) => ({
  message_id: 1
}))
const getMe = mock(async () => ({ id: 1, is_bot: true, first_name: "bot" }))
const setMyCommands = mock(async (_commands: { command: string; description: string }[]) => true)
let onStartHandler: (() => void) | undefined

mock.module("grammy", () => ({
  Bot: class {
    api = { getMe, sendMessage, setMyCommands }
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

const { createTelegramBot } = await import("../../../lib/telegram/bot")

function makeBot() {
  return createTelegramBot({
    botToken: "token",
    agentConfig: { model: "m", tools: [] },
    personas: [],
    models: []
  })
}

test("start() sets the command menu, and a failure there doesn't stop the bot", async () => {
  setMyCommands.mockClear()
  await makeBot().start()
  expect(setMyCommands.mock.calls[0]![0].map(c => c.command)).toEqual(["new", "abilities"])

  setMyCommands.mockImplementationOnce(async () => {
    throw new Error("network down")
  })
  await makeBot().start()
})

test("start() and stop() send no lifecycle notices — there is no allowlist to send them to", async () => {
  sendMessage.mockClear()
  const bot = makeBot()
  await bot.start()
  await bot.stop()
  expect(sendMessage).not.toHaveBeenCalled()
})
