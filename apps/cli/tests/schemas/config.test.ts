import { expect, test } from "bun:test"
import { KajaConfigSchema } from "@kaja/schema/config"

const base = {
  models: {
    chat: { model: "accounts/fireworks/models/minimax-m3", provider: "default" }
  }
}

test("config without preferences still validates", () => {
  const parsed = KajaConfigSchema.parse(base)
  expect(parsed.preferences).toBeUndefined()
})

test("config with preferences round-trips", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    preferences: { thinking: false, sounds: true }
  })
  expect(parsed.preferences).toEqual({ thinking: false, sounds: true })
})

test("partial preferences are allowed", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    preferences: { sounds: false }
  })
  expect(parsed.preferences).toEqual({ sounds: false })
})

test("preferences language accepts en and hu only", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    preferences: { language: "hu" }
  })
  expect(parsed.preferences).toEqual({ language: "hu" })
  expect(() => KajaConfigSchema.parse({ ...base, preferences: { language: "de" } })).toThrow()
})

test("models.chat is optional; models itself is required", () => {
  expect(() => KajaConfigSchema.parse({})).toThrow()
  expect(KajaConfigSchema.parse({ models: {} }).models.chat).toBeUndefined()
})

test("stt, tts are independently optional", () => {
  const parsed = KajaConfigSchema.parse(base)
  expect(parsed.stt).toBeUndefined()
  expect(parsed.tts).toBeUndefined()
})

test("stt group with only some optional fields validates", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    stt: { language: "en" }
  })
  expect(parsed.stt).toEqual({ language: "en" })
})

test("tts group with only some optional fields validates", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    tts: { voice: "af_heart" }
  })
  expect(parsed.tts).toEqual({ voice: "af_heart" })
})
