import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Nasi, type NasiOpenOptions } from "../src/nasi"
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

function open(
  path: string,
  script: { content: string | null; tool_calls?: unknown[] }[],
  extra?: Partial<NasiOpenOptions>
) {
  return Nasi.open({
    dbPath: path,
    chat: { client: fakeClient(script) as never, model: "fake" },
    ...extra
  })
}

test("ask_user tool yields needs_input and the next message binds as a tool result", async () => {
  const path = dbPath()
  const nasi = await open(path, [
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
  ])

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
  const nasi = await open(path, [{ content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
  closeStore(path)
})

test("leaked tool-call closing tags are stripped from the final message", async () => {
  const path = dbPath()
  const nasi = await open(path, [{ content: "It's a cat! Want to go another round? </parameter> </invoke> </invoke>" }])
  const result = await nasi.turnBuffered({ message: "yes" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("It's a cat! Want to go another round?")
  closeStore(path)
})

test("turn() streams delta events live and returns the same response turnBuffered would", async () => {
  const path = dbPath()
  const nasi = await open(path, [{ content: "streamed reply" }])

  const seen: string[] = []
  const gen = nasi.turn({ message: "hi" })
  let next = await gen.next()
  while (!next.done) {
    seen.push(next.value.type)
    next = await gen.next()
  }

  expect(seen).toContain("delta")
  expect(seen).toContain("final")
  expect(next.value.status).toBe("completed")
  expect(next.value.message).toBe("streamed reply")
  expect(next.value.session).toBeTruthy()
  closeStore(path)
})

test("turn() isolates concurrent streamed turns from different users' stores", async () => {
  const pathA = dbPath()
  const pathB = dbPath()
  const nasiA = await open(pathA, [{ content: "A-reply" }])
  const nasiB = await open(pathB, [{ content: "B-reply" }])

  async function drain(gen: AsyncGenerator<unknown, { message: string }, void>) {
    let next = await gen.next()
    while (!next.done) next = await gen.next()
    return next.value
  }

  const [resultA, resultB] = await Promise.all([
    drain(nasiA.turn({ message: "hi" })),
    drain(nasiB.turn({ message: "hi" }))
  ])
  expect(resultA.message).toBe("A-reply")
  expect(resultB.message).toBe("B-reply")
  closeStore(pathA)
  closeStore(pathB)
})

test("an empty round is retried with a nudge instead of surfacing a blank final message", async () => {
  const path = dbPath()
  const nasi = await open(path, [{ content: null }, { content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
  closeStore(path)
})

test("a fallback message is shown, never a blank reply, after exhausting retries", async () => {
  const path = dbPath()
  // 5 retries + the initial attempt = 6 empty rounds needed to exhaust the budget.
  const nasi = await open(path, Array(6).fill({ content: null }))
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).not.toBe("")
  expect(result.message.length).toBeGreaterThan(0)
  closeStore(path)
})

test("a session id cannot be resumed by a different owner sharing the same dbPath", async () => {
  const path = dbPath()
  const nasiOwnerA = await open(path, [{ content: "reply for A" }], { owner: "widget:key1:visitorA" })
  const first = await nasiOwnerA.turnBuffered({ message: "hi" })
  expect(first.status).toBe("completed")

  const nasiOwnerB = await open(path, [{ content: "should not be reached" }], { owner: "widget:key1:visitorB" })
  await expect(nasiOwnerB.turnBuffered({ session: first.session, message: "hijack attempt" })).rejects.toThrow()
  closeStore(path)
})
