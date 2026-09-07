import { expect, test } from "bun:test"
import { replyLanguageInstructionFor } from "../../src/agent/system-prompt"

test("returns undefined for English — the model's default, no instruction needed", () => {
  expect(replyLanguageInstructionFor("en")).toBeUndefined()
})

test("returns a reply-language instruction naming the language for a known non-English code", () => {
  expect(replyLanguageInstructionFor("hu")).toContain("Hungarian")
})

test("returns a reply-language instruction for zh-TW", () => {
  expect(replyLanguageInstructionFor("zh-TW")).toContain("Traditional Chinese")
})

test("returns undefined for an unknown language code", () => {
  expect(replyLanguageInstructionFor("xx")).toBeUndefined()
})
