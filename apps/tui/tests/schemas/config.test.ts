import { expect, test } from "bun:test"
import { KajaConfigSchema } from "@kaja/schema/config"

test("empty config validates — every field is optional", () => {
  const parsed = KajaConfigSchema.parse({})
  expect(parsed.preferences).toBeUndefined()
  expect(parsed.stt).toBeUndefined()
  expect(parsed.tts).toBeUndefined()
})

test("config with preferences round-trips", () => {
  const parsed = KajaConfigSchema.parse({
    preferences: { thinking: false, sounds: true }
  })
  expect(parsed.preferences).toEqual({ thinking: false, sounds: true })
})

test("partial preferences are allowed", () => {
  const parsed = KajaConfigSchema.parse({
    preferences: { sounds: false }
  })
  expect(parsed.preferences).toEqual({ sounds: false })
})

test("preferences locale accepts en-GB, hu-HU, and nan-TW only", () => {
  const parsed = KajaConfigSchema.parse({
    preferences: { locale: "hu-HU" }
  })
  expect(parsed.preferences).toEqual({ locale: "hu-HU" })
  expect(() => KajaConfigSchema.parse({ preferences: { locale: "de" } })).toThrow()
})

test("stt, tts are independently optional", () => {
  const parsed = KajaConfigSchema.parse({})
  expect(parsed.stt).toBeUndefined()
  expect(parsed.tts).toBeUndefined()
})

test("stt group with only some optional fields validates", () => {
  const parsed = KajaConfigSchema.parse({
    stt: { language: "en" }
  })
  expect(parsed.stt).toEqual({ language: "en" })
})

test("tts group with only some optional fields validates", () => {
  const parsed = KajaConfigSchema.parse({
    tts: { voice: "af_heart" }
  })
  expect(parsed.tts).toEqual({ voice: "af_heart" })
})
