import { expect, test } from "bun:test"
import { KajaConfigSchema } from "../../schemas/config"

const base = {
  models: {
    chat: "chat-default"
  }
}

test("config without settings still validates", () => {
  const parsed = KajaConfigSchema.parse(base)
  expect(parsed.settings).toBeUndefined()
})

test("config with settings round-trips", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    settings: { thinking: false, sounds: true }
  })
  expect(parsed.settings).toEqual({ thinking: false, sounds: true })
})

test("partial settings are allowed", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    settings: { sounds: false }
  })
  expect(parsed.settings).toEqual({ sounds: false })
})

test("settings language accepts en and hu only", () => {
  const parsed = KajaConfigSchema.parse({
    ...base,
    settings: { language: "hu" }
  })
  expect(parsed.settings).toEqual({ language: "hu" })
  expect(() => KajaConfigSchema.parse({ ...base, settings: { language: "de" } })).toThrow()
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
