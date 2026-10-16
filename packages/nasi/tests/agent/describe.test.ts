import { expect, test } from "bun:test"
import { z } from "zod"
import { Agent, type AgentEvent, applyPersona, createSession, seesImages, tool } from "../../src/agent/agent"
import { run } from "../../src/agent/run"
import { Nasi } from "../../src/nasi"
import { createMemoryStore, IMAGE_REF_PREFIX, imageId, memoryObjects, resolveImageLinks } from "../../src/store"
import { TINY_PNG, TINY_PNG_BASE64 } from "../fixtures/images"

type SentMessage = { role: string; content?: unknown }

const PHOTO = `data:image/png;base64,${TINY_PNG_BASE64}`
const LINK = `${IMAGE_REF_PREFIX}${imageId(TINY_PNG)}`
const DESCRIPTION = 'A red square with the word "STOP".'

function chat(replies: string[], sent: SentMessage[][]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: { messages: SentMessage[] }) => {
          sent.push(structuredClone(params.messages))
          const content = replies[i++] ?? "ok"
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content } }] }
            },
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", content } }] })
          }
        }
      }
    }
  }
}

/** A vision model that answers `text` (or fails) after `delayMs`, counting the times it's asked. */
function describer(text: string | Error = DESCRIPTION, delayMs = 0) {
  const asked: unknown[] = []
  const client = {
    chat: {
      completions: {
        create: async (params: unknown) => {
          asked.push(params)
          await Bun.sleep(delayMs)
          if (text instanceof Error) throw text
          return { model: "vision-m", choices: [{ message: { content: text } }], usage: { prompt_tokens: 9 } }
        }
      }
    }
  }
  return { asked, describer: { client: client as never, model: "vision-m" } }
}

const labelled = (messages: SentMessage[]) => JSON.stringify(messages)

test("a chat model that can't see gets the image's description, not its pixels, and waits for it", async () => {
  const sent: SentMessage[][] = []
  // Slower than the turn would be: without the wait, the request would carry the alt text
  const { asked, describer: vision } = describer(DESCRIPTION, 50)
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: { client: chat(["A stop sign."], sent) as never, model: "blind", seesImages: false },
    describer: vision
  })
  await nasi.turnBuffered({ message: "what is this?", images: [PHOTO] })
  expect(asked).toHaveLength(1)
  expect(labelled(sent[0]!)).toContain(`[Image ${LINK} (1×1): ${DESCRIPTION}]`.replaceAll('"', '\\"'))
  expect(labelled(sent[0]!)).not.toContain("image_url")
})

test("a blind model's saved session has the description in place of the alt text, kept beside the image for next time", async () => {
  const store = createMemoryStore()
  const { asked, describer: vision } = describer()
  const open = (sent: SentMessage[][]) =>
    Nasi.open({
      store,
      chat: { client: chat(["Seen."], sent) as never, model: "blind", seesImages: false },
      describer: vision
    })
  const first = await (await open([])).turnBuffered({ message: "look", images: [PHOTO] })
  const saved = (await store.loadSession(first.session))!.session.messages.find(m => m.role === "user")!
  expect(JSON.stringify(saved.content)).toContain(`(1×1): ${DESCRIPTION}`.replaceAll('"', '\\"'))
  expect(await store.images(first.session).description(imageId(TINY_PNG))).toBe(DESCRIPTION)

  // The same image again in the session: its kept description, no second request to the vision model
  const sent: SentMessage[][] = []
  await (await open(sent)).turnBuffered({ session: first.session, message: "and again", images: [PHOTO] })
  expect(asked).toHaveLength(1)
  expect(labelled(sent[0]!).split(DESCRIPTION.slice(0, 12)).length - 1).toBe(2)
})

test("a chat model that sees doesn't wait for a description at the turn's end", async () => {
  // Never answers: a turn that waited would hang for the describe timeout
  const hung = { client: { chat: { completions: { create: () => new Promise(() => {}) } } } as never, model: "v" }
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: { client: chat(["Seen."], []) as never, model: "sees" },
    describer: hung
  })
  const done = await nasi.turnBuffered({ message: "look", images: [PHOTO] })
  expect(done.status).toBe("completed")
}, 10_000)

test("an image whose description fails keeps its alt text, and the turn goes on", async () => {
  const sent: SentMessage[][] = []
  const { describer: vision } = describer(new Error("vision model down"))
  const nasi = await Nasi.open({
    store: createMemoryStore(),
    chat: { client: chat(["Hm."], sent) as never, model: "blind", seesImages: false },
    describer: vision
  })
  const done = await nasi.turnBuffered({ message: "what is this?", images: [PHOTO] })
  expect(done.status).toBe("completed")
  expect(labelled(sent[0]!)).toContain(`[Image ${LINK} (1×1): an image the user sent]`)
})

test("a chat model sees images unless its models.toml entry says images = false", () => {
  const entry = (images?: boolean) => ({
    id: "m",
    model: "m",
    task: "chat" as const,
    baseUrl: "http://x",
    provider: "p",
    ...(images === undefined ? {} : { images })
  })
  const agent = (models: ReturnType<typeof entry>[]) => new Agent({ model: "m", tools: [], models })
  expect(seesImages(agent([entry()]))).toBe(true)
  expect(seesImages(agent([entry(false)]))).toBe(false)
  expect(seesImages(agent([]))).toBe(true)
  expect(seesImages(new Agent({ model: "m", tools: [], chatSeesImages: false }))).toBe(false)
})

test("a tool image's event carries its alt text, and an image_described event follows once its description is in", async () => {
  const { describer: vision } = describer()
  const snap = tool({
    name: "snap",
    description: "Takes a picture",
    schema: z.object({}),
    execute: async () => ({
      text: "Took a screenshot of the page",
      images: [{ data: TINY_PNG, mimeType: "image/png" }]
    })
  })
  const replies = [
    { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "snap", arguments: "{}" } }] },
    { content: "Done." }
  ]
  let i = 0
  const client = {
    chat: {
      completions: {
        stream: () => {
          const message = replies[i++]!
          return {
            async *[Symbol.asyncIterator]() {},
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", ...message } }] })
          }
        }
      }
    }
  }
  const agent = new Agent({
    model: "m",
    client: client as never,
    tools: [snap],
    // Blind, so the turn waits for the description at its end
    chatSeesImages: false,
    describer: vision,
    store: createMemoryStore()
  })
  const events: AgentEvent[] = []
  for await (const event of run(agent, "take one", createSession())) events.push(event)
  expect(events.find(event => event.type === "tool_image")).toMatchObject({
    ref: LINK,
    alt: "Took a screenshot of the page"
  })
  expect(events.filter(event => event.type === "image_described")).toEqual([
    { type: "image_described", ref: LINK, description: DESCRIPTION }
  ])
})

test("a reply's kaja-image: links become their images' URLs; one with nowhere to go stays as it is", () => {
  const text = `Here: ![a cat](kaja-image:0123456789abcdef) and ![a dog](kaja-image:fedcba9876543210)`
  const url = (id: string) => (id === "0123456789abcdef" ? `https://img/${id}` : undefined)
  expect(resolveImageLinks(text, url)).toBe(
    "Here: ![a cat](https://img/0123456789abcdef) and ![a dog](kaja-image:fedcba9876543210)"
  )
})

test("a reply's kaja-image: links reach every host placed where their images open; the session keeps the refs", async () => {
  const store = createMemoryStore({ objects: { ...memoryObjects(), location: key => `https://img/${key}` } })
  const nasi = await Nasi.open({
    store,
    chat: { client: chat([`Here: ![a square](${LINK})`], []) as never, model: "m" }
  })
  const done = await nasi.turnBuffered({ message: "show it", images: [PHOTO] })
  expect(done.message).toBe(`Here: ![a square](https://img/images/${done.session}/${imageId(TINY_PNG)})`)
  const saved = (await store.loadSession(done.session))!.session.messages.at(-1)!
  expect(saved.content).toBe(`Here: ![a square](${LINK})`)
})

test("a persona's models.vision pin describes its images; one without goes back to the host's describer", () => {
  const { describer: host } = describer()
  const pinned = { id: "local-vlm", model: "vlm", task: "vision" as const, baseUrl: "http://x", provider: "p" }
  const agent = new Agent({
    model: "m",
    tools: [],
    models: [pinned],
    describer: host,
    createClient: model => ({ for: model.id }) as never
  })
  applyPersona(agent, { id: "eyes", label: "Eyes", instructions: "", models: { vision: "local-vlm" } } as never)
  expect(agent.describer).toEqual({ client: { for: "local-vlm" } as never, model: "vlm" })
  applyPersona(agent, { id: "plain", label: "Plain", instructions: "" } as never)
  expect(agent.describer).toBe(host)
})
