import { expect, test } from "bun:test"
import { compactedLine, openReply, type ReplyChannel } from "../telegram"

function fakeChannel(overrides: Partial<ReplyChannel<string>> = {}) {
  const sent: string[] = []
  const edits: string[] = []
  const photos: { photo: string; caption?: string }[] = []
  const warnings: string[] = []
  const channel: ReplyChannel<string> = {
    send: async text => {
      sent.push(text)
      return { messageId: sent.length }
    },
    edit: async (_messageId, text) => {
      edits.push(text)
    },
    sendPhoto: async (photo, caption) => {
      photos.push({ photo, caption })
    },
    photoSource: src => (src.startsWith("https://") ? src : undefined),
    emptyReply: "(empty)",
    warn: message => warnings.push(message),
    ...overrides
  }
  return { channel, sent, edits, photos, warnings }
}

test("a reply starts as a placeholder and finishes with the rendered text, never sending the same edit twice", async () => {
  const { channel, sent, edits } = fakeChannel()
  const reply = await openReply(channel)
  reply.append("Hello **there**")
  expect(reply.streamed).toBe("Hello **there**")
  await reply.finish("Hello **there**")
  await reply.finish("Hello **there**")
  expect(sent).toEqual(["…"])
  expect(edits).toEqual(["Hello <b>there</b>"])
})

test("images the host allows follow as photos, the text keeping their alt; an image-only reply leaves 📷", async () => {
  const { channel, edits, photos } = fakeChannel()
  await (await openReply(channel)).finish("![a cat](https://x.test/cat.png) ![secret](/etc/passwd.png)")
  expect(photos).toEqual([{ photo: "https://x.test/cat.png", caption: "a cat" }])

  const only = fakeChannel()
  await (await openReply(only.channel)).finish("![](https://x.test/cat.png)")
  expect(only.edits).toEqual(["📷"])
  expect(edits[0]).toContain("a cat")
})

test("an empty reply says so, and a failed photo is only a warning", async () => {
  const { channel, edits, warnings } = fakeChannel({
    sendPhoto: () => Promise.reject(new Error("too big"))
  })
  await (await openReply(channel)).finish("")
  expect(edits).toEqual(["(empty)"])

  await (await openReply(channel)).finish("![a](https://x.test/a.png)")
  expect(warnings).toEqual(["Telegram photo send failed"])
})

test("settle finishes what was streamed, or leaves the placeholder; fail replaces it", async () => {
  const quiet = fakeChannel()
  await (await openReply(quiet.channel)).settle()
  expect(quiet.edits).toEqual([])

  const { channel, edits } = fakeChannel()
  const reply = await openReply(channel)
  reply.append("Let me check.")
  await reply.settle()
  await reply.fail("⚠ Network error: timeout")
  expect(edits).toEqual(["Let me check.", "⚠ Network error: timeout"])
})

test("compactedLine picks the key by whether the summary was written", () => {
  const t = (key: string, params: Record<string, string>) => `${key} ${params.before}→${params.after}`
  expect(compactedLine({ beforeTokens: 1200, afterTokens: 300, dropped: false }, t)).toBe(
    `telegram.compacted ${(1200).toLocaleString()}→300`
  )
  expect(compactedLine({ beforeTokens: 10, afterTokens: 5, dropped: true }, t)).toBe("telegram.compactedDropped 10→5")
})
