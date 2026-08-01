import { expect, mock, test } from "bun:test"
import { tmpdir } from "node:os"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-summarize`

mock.module("../../lib/openai", () => ({
  chatModelId: "test-model",
  client: {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "mocked summary" } }]
        })
      }
    }
  }
}))

const { summarizeTool } = await import("../../tools/summarize")

test("summarize summarizes text", async () => {
  const result = await summarizeTool.execute({ text: "a long story" })
  expect(result).toBe("mocked summary")
})

test("summarize passes through instructions", async () => {
  const result = await summarizeTool.execute({
    text: "a long story",
    instructions: "3 bullet points"
  })
  expect(result).toBe("mocked summary")
})
