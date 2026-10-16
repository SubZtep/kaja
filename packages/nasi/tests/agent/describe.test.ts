import { expect, test } from "bun:test"
import { Agent, seesImages } from "../../src/agent/agent"
import { Nasi } from "../../src/nasi"
import { createMemoryStore, IMAGE_REF_PREFIX, imageId } from "../../src/store"
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

test("a description replaces the alt text in the saved session, and is kept beside the image for next time", async () => {
  const store = createMemoryStore()
  const { asked, describer: vision } = describer()
  const open = (sent: SentMessage[][]) =>
    Nasi.open({ store, chat: { client: chat(["Seen."], sent) as never, model: "sees" }, describer: vision })
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

test("a chat model sees images when its models.toml entry lists vision; with no entries to tell, it's assumed to", () => {
  const entry = (task: "chat" | "vision") => ({ id: "m", model: "m", task, baseUrl: "http://x", provider: "p" })
  const agent = (models: ReturnType<typeof entry>[]) => new Agent({ model: "m", tools: [], models })
  expect(seesImages(agent([entry("chat")]))).toBe(false)
  expect(seesImages(agent([entry("chat"), entry("vision")]))).toBe(true)
  expect(seesImages(agent([]))).toBe(true)
  expect(seesImages(new Agent({ model: "m", tools: [], chatSeesImages: false }))).toBe(false)
})
