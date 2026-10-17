import { expect, test } from "bun:test"
import { compactedLine, openReply, type ReplyChannel, TelegramRateLimitError } from "../telegram"

function fakeChannel(overrides: Partial<ReplyChannel<string>> = {}) {
  const sent: string[] = []
  const edits: { messageId: number; text: string }[] = []
  const removed: number[] = []
  const photos: { photo: string; caption?: string }[] = []
  const warnings: string[] = []
  const channel: ReplyChannel<string> = {
    send: async text => {
      sent.push(text)
      return { messageId: sent.length }
    },
    edit: async (messageId, text) => {
      edits.push({ messageId, text })
    },
    remove: async messageId => {
      removed.push(messageId)
    },
    sendPhoto: async (photo, caption) => {
      photos.push({ photo, caption })
    },
    photoSource: src => (src.startsWith("https://") ? src : undefined),
    emptyReply: "(empty)",
    warn: message => warnings.push(message),
    ...overrides
  }
  const texts = () => edits.map(edit => edit.text)
  return { channel, sent, edits, texts, removed, photos, warnings }
}

test("a reply starts as a placeholder and finishes with the rendered text, never sending the same edit twice", async () => {
  const { channel, sent, texts } = fakeChannel()
  const reply = await openReply(channel)
  reply.append("Hello **there**")
  expect(reply.streamed).toBe("Hello **there**")
  await reply.finish("Hello **there**")
  await reply.finish("Hello **there**")
  expect(sent).toEqual(["…"])
  expect(texts()).toEqual(["Hello <b>there</b>"])
})

test("images the host allows follow as photos, the text keeping their alt; an image-only reply leaves 📷", async () => {
  const { channel, texts, photos } = fakeChannel()
  await (await openReply(channel)).finish("![a cat](https://x.test/cat.png) ![secret](/etc/passwd.png)")
  expect(photos).toEqual([{ photo: "https://x.test/cat.png", caption: "a cat" }])

  const only = fakeChannel()
  await (await openReply(only.channel)).finish("![](https://x.test/cat.png)")
  expect(only.texts()).toEqual(["📷"])
  expect(texts()[0]).toContain("a cat")
})

test("an empty reply says so, and a failed photo is only a warning", async () => {
  const { channel, texts, warnings } = fakeChannel({
    sendPhoto: () => Promise.reject(new Error("too big"))
  })
  await (await openReply(channel)).finish("")
  expect(texts()).toEqual(["(empty)"])

  await (await openReply(channel)).finish("![a](https://x.test/a.png)")
  expect(warnings).toEqual(["Telegram photo send failed"])
})

test("settle finishes what was streamed, or removes the untouched placeholder; fail replaces it", async () => {
  const quiet = fakeChannel()
  await (await openReply(quiet.channel)).settle()
  expect(quiet.edits).toEqual([])
  expect(quiet.removed).toEqual([1])

  const { channel, texts, removed } = fakeChannel()
  const reply = await openReply(channel)
  reply.append("Let me check.")
  await reply.settle()
  await reply.fail("⚠ Network error: timeout")
  expect(texts()).toEqual(["Let me check.", "⚠ Network error: timeout"])
  expect(removed).toEqual([])
})

test("a round that calls tools keeps its text as a message of its own, and the next round's text starts a new one", async () => {
  const { channel, sent, edits } = fakeChannel()
  const reply = await openReply(channel)
  reply.append("Let me check.")
  await reply.endRound("Let me check.")
  reply.append("It's 5°C.")
  await reply.finish("It's 5°C.")
  expect(sent).toEqual(["…", "It's 5°C."])
  expect(edits).toEqual([{ messageId: 1, text: "Let me check." }])
})

test("a round with no text leaves the placeholder for the next round", async () => {
  const { channel, sent, edits } = fakeChannel()
  const reply = await openReply(channel)
  await reply.endRound("")
  await reply.finish("Done.")
  expect(sent).toEqual(["…", "Done."])
  expect(edits).toEqual([])
})

test("a failed edit isn't counted as sent, so the same text goes out again", async () => {
  let failures = 1
  const { channel, texts, warnings } = fakeChannel()
  const edit = channel.edit
  channel.edit = async (messageId, text) => {
    if (failures-- > 0) throw new Error("network down")
    await edit(messageId, text)
  }
  const reply = await openReply(channel)
  await reply.fail("first try")
  await reply.finish("first try")
  expect(warnings).toEqual(["Telegram edit failed"])
  expect(texts()).toEqual(["first try"])
})

test("a finished reply waits out one rate limit before trying again", async () => {
  let limited = true
  const { channel, texts } = fakeChannel()
  const edit = channel.edit
  channel.edit = async (messageId, text) => {
    if (limited) {
      limited = false
      throw new TelegramRateLimitError(0.01)
    }
    await edit(messageId, text)
  }
  await (await openReply(channel)).finish("Hello")
  expect(texts()).toEqual(["Hello"])
})

test("compactedLine picks the key by whether the summary was written, with numbers in the given locale", () => {
  const t = (key: string, params: Record<string, string>) => `${key} ${params.before}→${params.after}`
  expect(compactedLine({ beforeTokens: 1200, afterTokens: 300, dropped: false }, t, "en-GB")).toBe(
    "telegram.compacted 1,200→300"
  )
  expect(compactedLine({ beforeTokens: 1200, afterTokens: 300, dropped: false }, t, "hu-HU")).toBe(
    `telegram.compacted ${(1200).toLocaleString("hu-HU")}→300`
  )
  expect(compactedLine({ beforeTokens: 10, afterTokens: 5, dropped: true }, t)).toBe("telegram.compactedDropped 10→5")
})
