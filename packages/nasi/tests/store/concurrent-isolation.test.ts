import { expect, test } from "bun:test"
import { Nasi } from "../../src/nasi"
import { createMemoryStore } from "../../src/store"

function toolCallClient(reply: string, delayBeforeMs: number, toolCall?: { name: string; args: unknown }) {
  let round = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const thisRound = round++
          return {
            async *[Symbol.asyncIterator]() {
              if (thisRound === 0 && toolCall) await new Promise(r => setTimeout(r, delayBeforeMs))
            },
            finalChatCompletion: async () => {
              if (thisRound === 0 && toolCall) {
                return {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "call_1",
                            type: "function",
                            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
              return { choices: [{ message: { role: "assistant", content: reply } }] }
            }
          }
        }
      }
    }
  } as never
}

test("concurrent turns from different stores do not cross-write memory", async () => {
  const storeA = createMemoryStore()
  const storeB = createMemoryStore()

  const nasiA = await Nasi.open({
    store: storeA,
    chat: {
      client: toolCallClient("A-done", 50, {
        name: "remember_note",
        args: { key: "k", content: "A-secret", importance: "high" }
      }),
      model: "m"
    }
  })
  const nasiB = await Nasi.open({
    store: storeB,
    chat: { client: toolCallClient("B-done", 0), model: "m" }
  })

  await Promise.all([nasiA.turnBuffered({ message: "remember this" }), nasiB.turnBuffered({ message: "hi from B" })])

  expect((await storeA.loadMemory(null)).k).toBeDefined()
  expect((await storeB.loadMemory(null)).k).toBeUndefined()
})
