import { expect, mock, spyOn, test } from "bun:test"
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

[tasks]
chat = "chat"

[models.chat]
model = "x"
tasks = ["chat"]
provider = "default"
`
)

// telegram-bot.ts is the one grammy-aware module, so its own test mocks grammy's Bot rather than hitting the real Telegram API — mirrors how tests/lib/telegram-driver.test.ts stays grammy-free by testing against a fake TelegramSender instead.
const sendMessage = mock(async (_chatId: number, _text: string) => ({
  message_id: 1
}))
const getMe = mock(async () => ({ id: 1, is_bot: true, first_name: "bot" }))
const setMyCommands = mock(async (_commands: { command: string; description: string }[]) => true)
type Handler = (ctx: any) => unknown
let handlers: Record<string, Handler> = {}

mock.module("grammy", () => ({
  Bot: class {
    api = { getMe, sendMessage, setMyCommands }
    constructor() {
      handlers = {}
    }
    on(filter: string, handler: Handler) {
      handlers[filter] = handler
    }
    catch() {}
    async start(opts?: { onStart?: (botInfo: { username: string }) => void }) {
      opts?.onStart?.({ username: "my_kaja_bot" })
    }
    async stop() {}
  },
  GrammyError: class extends Error {},
  InlineKeyboard: class {},
  InputFile: class {}
}))

const { createTelegramBot } = await import("../../../lib/telegram/bot")

function makeBot(opts: Partial<Parameters<typeof createTelegramBot>[0]> = {}) {
  return createTelegramBot({
    botToken: "token",
    ownerIds: [1],
    ...opts,
    agentConfig: { model: "m", tools: [] },
    personas: [],
    models: []
  })
}

test("start() sets the command menu, and a failure there doesn't stop the bot", async () => {
  setMyCommands.mockClear()
  await makeBot().start()
  expect(setMyCommands.mock.calls[0]![0].map(c => c.command)).toEqual(["new", "compact", "abilities"])

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

function textCtx(fromId: number, text: string) {
  return {
    from: { id: fromId, first_name: "Ann", last_name: "Lee" },
    chat: { id: fromId },
    message: { text },
    reply: mock(async (_text: string) => {})
  }
}

async function startCapturingLog(bot: ReturnType<typeof makeBot>) {
  const lines: string[] = []
  const spy = spyOn(console, "log").mockImplementation((line: string) => void lines.push(line))
  try {
    await bot.start()
  } finally {
    spy.mockRestore()
  }
  return lines.join("\n")
}

function codeFrom(log: string) {
  return /start=([A-Z0-9-]+)/.exec(log)![1]!
}

test("with owners and no --pair, no code is printed and a stranger's /start gets nothing", async () => {
  const bot = makeBot()
  expect(await startCapturingLog(bot)).not.toContain("t.me/")
  const ctx = textCtx(99, "/start")
  await handlers["message:text"]!(ctx)
  expect(ctx.reply).not.toHaveBeenCalled()
})

test("with no owners, start prints a code; sending it pairs, saves and confirms", async () => {
  const onPaired = mock(async (_user: { id: number; name: string }) => {})
  const bot = makeBot({ ownerIds: [], onPaired })
  const log = await startCapturingLog(bot)
  expect(log).toContain("https://t.me/my_kaja_bot?start=")

  const stranger = textCtx(7, "/start WRONG-CODE")
  await handlers["message:text"]!(stranger)
  expect(stranger.reply).not.toHaveBeenCalled()

  const ctx = textCtx(5, `/start ${codeFrom(log)}`)
  const logSpy = spyOn(console, "log").mockImplementation(() => {})
  await handlers["message:text"]!(ctx)
  logSpy.mockRestore()
  expect(onPaired).toHaveBeenCalledWith({ id: 5, name: "Ann Lee" })
  expect(ctx.reply).toHaveBeenCalledTimes(1)
})

test("--pair opens pairing even with owners", async () => {
  const log = await startCapturingLog(makeBot({ pair: true }))
  expect(log).toContain("https://t.me/my_kaja_bot?start=")
})

test("a stranger's button tap is dropped before the driver sees it", async () => {
  makeBot()
  const answerCallbackQuery = mock(async () => {})
  handlers["callback_query:data"]!({
    from: { id: 99 },
    callbackQuery: { id: "q", data: "cmd:approve:x", message: { chat: { id: 99 }, message_id: 1 } },
    answerCallbackQuery
  })
  expect(answerCallbackQuery).not.toHaveBeenCalled()
})
