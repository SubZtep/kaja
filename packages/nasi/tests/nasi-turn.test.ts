import { afterEach, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Nasi } from "../src/nasi"
import { closeStore } from "../src/store/db"

function fakeClient(script: { content: string | null; tool_calls?: unknown[] }[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const message = script[i++]
          if (!message) throw new Error("script exhausted")
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", ...message } }]
            })
          }
        }
      }
    }
  }
}

function dbPath() {
  return join(mkdtempSync(join(tmpdir(), "nasi-turn-")), "nasi.sqlite")
}

afterEach(() => {
  // each test uses a fresh path
})

test("ask_user tool yields needs_input and the next message binds as a tool result", async () => {
  const path = dbPath()
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      client: fakeClient([
        {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "ask_user", arguments: JSON.stringify({ question: "Favorite color?" }) }
            }
          ]
        },
        { content: "Noted, blue." }
      ]) as never,
      model: "fake"
    }
  })
  // Hosted tools include ask_user; inject the same intercept tool plus skip extras by using local agent tools via createTools.
  // turnBuffered uses createTools hosted which includes ask_user.

  const first = await nasi.turnBuffered({ message: "hi" })
  expect(first.status).toBe("needs_input")
  expect(first.message).toBe("Favorite color?")
  expect(first.session).toBeTruthy()

  const second = await nasi.turnBuffered({ session: first.session, message: "blue" })
  expect(second.status).toBe("completed")
  expect(second.message).toBe("Noted, blue.")
  closeStore(path)
})

test("plain question mark final is completed, not needs_input", async () => {
  const path = dbPath()
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      client: fakeClient([{ content: "Is it alive?" }]) as never,
      model: "fake"
    }
  })
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
  closeStore(path)
})
