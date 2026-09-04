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

test("leaked tool-call closing tags are stripped from the final message", async () => {
  const path = dbPath()
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      client: fakeClient([
        { content: "It's a cat! Want to go another round? </parameter> </invoke> </invoke>" }
      ]) as never,
      model: "fake"
    }
  })
  const result = await nasi.turnBuffered({ message: "yes" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("It's a cat! Want to go another round?")
  closeStore(path)
})

test("turn() streams delta events live and returns the same response turnBuffered would", async () => {
  const path = dbPath()
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      client: fakeClient([{ content: "streamed reply" }]) as never,
      model: "fake"
    }
  })

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
  const nasiA = await Nasi.open({
    dbPath: pathA,
    profile: "hosted",
    chat: { client: fakeClient([{ content: "A-reply" }]) as never, model: "fake" }
  })
  const nasiB = await Nasi.open({
    dbPath: pathB,
    profile: "hosted",
    chat: { client: fakeClient([{ content: "B-reply" }]) as never, model: "fake" }
  })

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
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      client: fakeClient([{ content: null }, { content: "Is it alive?" }]) as never,
      model: "fake"
    }
  })
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
  closeStore(path)
})

test("a fallback message is shown, never a blank reply, after exhausting retries", async () => {
  const path = dbPath()
  const nasi = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    chat: {
      // 5 retries + the initial attempt = 6 empty rounds needed to exhaust the budget.
      client: fakeClient(Array(6).fill({ content: null })) as never,
      model: "fake"
    }
  })
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).not.toBe("")
  expect(result.message.length).toBeGreaterThan(0)
  closeStore(path)
})

test("a session id cannot be resumed by a different owner sharing the same dbPath", async () => {
  const path = dbPath()
  const nasiOwnerA = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    owner: "widget:key1:visitorA",
    chat: { client: fakeClient([{ content: "reply for A" }]) as never, model: "fake" }
  })
  const first = await nasiOwnerA.turnBuffered({ message: "hi" })
  expect(first.status).toBe("completed")

  const nasiOwnerB = await Nasi.open({
    dbPath: path,
    profile: "hosted",
    owner: "widget:key1:visitorB",
    chat: { client: fakeClient([{ content: "should not be reached" }]) as never, model: "fake" }
  })

  await expect(nasiOwnerB.turnBuffered({ session: first.session, message: "hijack attempt" })).rejects.toThrow()
  closeStore(path)
})
