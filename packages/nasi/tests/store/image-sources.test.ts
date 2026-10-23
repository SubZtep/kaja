import { expect, test } from "bun:test"
import { z } from "zod"
import { answerClientCalls } from "../../src/abilities/client"
import { Agent, createSession, tool } from "../../src/agent/agent"
import { relabeledParts } from "../../src/agent/describe"
import { run } from "../../src/agent/run"
import { createMemoryStore, IMAGE_REF_PREFIX, imageId, type ImageSource, type NasiStore } from "../../src/store"
import { setToolDeps } from "../../src/tools/deps"
import { TINY_PNG, TINY_PNG_BASE64 } from "../fixtures/images"

const LINK = `${IMAGE_REF_PREFIX}${imageId(TINY_PNG)}`

function reply(content: string) {
  return {
    chat: {
      completions: {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { choices: [{ delta: { content } }] }
          },
          finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", content } }] })
        })
      }
    }
  }
}

/** A memory store that notes the source each stored image arrived with. */
function recordingStore(): { store: NasiStore; sources: (ImageSource | undefined)[] } {
  const store = createMemoryStore()
  const sources: (ImageSource | undefined)[] = []
  const images: NasiStore["images"] = id => {
    const inner = store.images(id)
    return {
      ...inner,
      put: (image, source) => {
        sources.push(source)
        return inner.put(image, source)
      }
    }
  }
  return { store: { ...store, images }, sources }
}

const agentWith = (store: NasiStore, content = "ok", tools: Agent["tools"] = []) =>
  new Agent({ model: "m", client: reply(content) as never, tools, store })

test("a reply's remote image keeps its URL, alt and title; its link loses the title", async () => {
  setToolDeps({
    fetchSend: async () => new Response(new Uint8Array(TINY_PNG), { headers: { "content-type": "image/png" } })
  })
  const fetchUrl = tool({ name: "fetch_url", description: "Fetches", schema: z.object({}), execute: async () => "" })
  const { store, sources } = recordingStore()
  const session = createSession()
  const agent = agentWith(store, 'Look: ![a square](https://img.example/a.png "A red square")', [fetchUrl])
  for await (const _ of run(agent, "show it", session));
  setToolDeps({})
  expect(sources).toEqual([{ url: "https://img.example/a.png", alt: "a square", title: "A red square" }])
  expect(session.messages.at(-1)).toMatchObject({ content: `Look: ![a square](${LINK})` })
})

test("a tool's image arrives with the source the tool gave it", async () => {
  const shot = tool({
    name: "shot",
    description: "Takes one",
    schema: z.object({}),
    execute: async () => ({
      text: "Here",
      images: [{ data: TINY_PNG, mimeType: "image/png", source: { url: "https://img.example/b.png" } }]
    })
  })
  const { store, sources } = recordingStore()
  const calls = {
    chat: {
      completions: {
        stream: (() => {
          let round = 0
          return () => {
            const first = round++ === 0
            const message = first
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [{ id: "c1", type: "function", function: { name: "shot", arguments: "{}" } }]
                }
              : { role: "assistant", content: "done" }
            return {
              async *[Symbol.asyncIterator]() {},
              finalChatCompletion: async () => ({ choices: [{ message }] })
            }
          }
        })()
      }
    }
  }
  const agent = new Agent({ model: "m", client: calls as never, tools: [shot], store })
  const events: { type: string; source?: unknown }[] = []
  for await (const event of run(agent, "take one", createSession())) events.push(event)
  expect(sources).toEqual([{ url: "https://img.example/b.png" }])
  // Hosts show it beside the image
  expect(events.find(event => event.type === "tool_image")?.source).toEqual({ url: "https://img.example/b.png" })
})

test("a prompt's images keep their sources: a sent file's name, an approved tool's file", async () => {
  const { store, sources } = recordingStore()
  const images = [
    { data: `data:image/png;base64,${TINY_PNG_BASE64}`, source: { fileName: "square.png" } },
    { data: TINY_PNG, alt: "Viewing image: /tmp/photo.png", source: { fileName: "photo.png" } },
    TINY_PNG
  ]
  for await (const _ of run(agentWith(store), "look", createSession(), undefined, images));
  expect(sources).toEqual([{ fileName: "square.png" }, { fileName: "photo.png" }, undefined])
})

test("a computer's tool result passes on its image file's name", async () => {
  const { store, sources } = recordingStore()
  const session = { ...createSession(), pendingClientCalls: ["c1"] }
  await answerClientCalls(agentWith(store), session, [
    {
      id: "c1",
      text: "Viewing image: ~/a.png",
      images: [{ data: TINY_PNG_BASE64, mimeType: "image/png", fileName: "a.png" }]
    }
  ])
  expect(sources).toEqual([{ fileName: "a.png" }])
})

test("a late description replaces only its own image's label in saved parts", () => {
  const other = `${IMAGE_REF_PREFIX}fedcba9876543210`
  const parts = [
    { type: "text", text: `[Image ${LINK} (1×1): an image the user sent]` },
    { type: "image_url", image_url: { url: LINK } },
    { type: "text", text: `[Image ${other} (1×1): another]` }
  ]
  expect(relabeledParts(parts, LINK, { width: 1, height: 1 }, "A dot.")).toEqual([
    { type: "text", text: `[Image ${LINK} (1×1): A dot.]` },
    parts[1],
    parts[2]
  ])
  expect(relabeledParts([parts[2]], LINK, { width: 1, height: 1 }, "A dot.")).toBeUndefined()
})
