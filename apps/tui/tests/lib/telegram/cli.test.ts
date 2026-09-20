import { expect, test } from "bun:test"
import { runTelegramCli } from "../../../lib/telegram/cli"

test("without a bot token, exits 1 without ever importing telegram-bot", async () => {
  const code = await runTelegramCli({
    botToken: undefined,
    tools: [],
    personas: [],
    models: [],
    closeTools: async () => {}
  })
  expect(code).toBe(1)
})
