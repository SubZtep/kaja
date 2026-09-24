import { afterEach, expect, test } from "bun:test"
import type OpenAI from "openai"
import { summarizeTool } from "../../src/tools/builtin/summarize"
import { setToolDeps } from "../../src/tools/deps"

/** A client whose `create()` answers with `name`, recording what it was sent. */
function model(name: string) {
  const asked: { messages: { content: string }[] }[] = []
  const client = {
    chat: {
      completions: {
        create: async (body: { messages: { content: string }[] }) => {
          asked.push(body)
          return { choices: [{ message: { content: `from ${name}` } }] }
        }
      }
    }
  } as unknown as OpenAI
  return { chat: { client, model: name }, asked }
}

afterEach(() => setToolDeps({}))

test("summarize uses the summarize model when there is one, else the chat model", async () => {
  const chat = model("chat")
  const summarizer = model("small")
  setToolDeps({ chat: chat.chat, summarizer: summarizer.chat })
  expect(await summarizeTool.execute({ text: "long text", instructions: "3 bullets" }, {} as never)).toBe("from small")
  expect(summarizer.asked[0]!.messages[0]!.content).toContain("Pay special attention to: 3 bullets")
  expect(chat.asked).toHaveLength(0)

  setToolDeps({ chat: chat.chat })
  expect(await summarizeTool.execute({ text: "long text" }, {} as never)).toBe("from chat")
})

test("text too long for one request is summarised in parts, then as a whole", async () => {
  const small = model("small")
  setToolDeps({ summarizer: { ...small.chat, contextWindow: 1000 } })
  await summarizeTool.execute({ text: "word ".repeat(5000) }, {} as never)
  expect(small.asked.length).toBeGreaterThan(2)
  expect(small.asked[0]!.messages[1]!.content).toStartWith("Part 1 of")
})

test("without any model it says so instead of failing", async () => {
  expect(await summarizeTool.execute({ text: "x" }, {} as never)).toBe("Summarize is not configured.")
})
