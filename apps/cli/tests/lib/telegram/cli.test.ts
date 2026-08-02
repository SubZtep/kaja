import { expect, test } from "bun:test"
import { runTelegramCli } from "../../../lib/telegram/cli"

test("without a telegram services block, exits 1 without ever importing telegram-bot", async () => {
  const code = await runTelegramCli({
    services: {},
    tools: [],
    personas: [],
    models: []
  })
  expect(code).toBe(1)
})
