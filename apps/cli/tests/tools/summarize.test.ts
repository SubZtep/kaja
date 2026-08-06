import { expect, mock, test } from "bun:test"
import { tmpdir } from "node:os"
import OpenAI from "openai"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-summarize`

// mock.module() leaks into every later test file's import of this module, so the mock must mirror the real module's full shape.
// Helpers are reimplemented (not re-exported) since the real module's config() hard-exits on this file's empty XDG_CONFIG_HOME.
const KAJA_MODEL_HEADER = "x-kaja-model"
let lastServedModel: string | undefined

mock.module("../../lib/models/openai", () => ({
  chatModelId: "test-model",
  client: {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "mocked summary" } }]
        })
      }
    }
  },
  isFreeChat: false,
  FREE_CHAT_PROVIDER: "kaja",
  KAJA_MODEL_HEADER,
  noteServedModel: (model: string) => {
    lastServedModel = model
  },
  takeLastServedModel: () => {
    const model = lastServedModel
    lastServedModel = undefined
    return model
  },
  createOpenAIClient: (opts: { baseURL: string; apiKey: string; headers?: Record<string, string> }) =>
    new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers)
        for (const [key, value] of Object.entries(opts.headers ?? {})) headers.set(key, value)
        const res = await fetch(input, { ...init, headers })
        const served = res.headers.get(KAJA_MODEL_HEADER)
        if (served) lastServedModel = served
        return res
      }
    })
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
