import { afterAll, beforeAll, expect, test } from "bun:test"
import { modelService } from "../../src/services"
import { cleanupModel, seedModel } from "./helpers"

let summarizeProvider: string
let chatProvider: string

beforeAll(async () => {
  summarizeProvider = (await seedModel("pick-summarize", ["summarize"])).providerId
  chatProvider = (await seedModel("pick-chat")).providerId
})

afterAll(async () => {
  await cleanupModel(summarizeProvider)
  await cleanupModel(chatProvider)
})

test("a random pick serves the task asked for: chat by default, or summarize", async () => {
  for (let i = 0; i < 5; i++) {
    expect((await modelService.getRandomModelWithProvider())?.model.tasks).toContain("chat")
    expect((await modelService.getRandomModelWithProvider("summarize"))?.model.tasks).toContain("summarize")
  }
})
