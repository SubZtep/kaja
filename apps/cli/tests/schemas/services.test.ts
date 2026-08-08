import { expect, test } from "bun:test"
import { ServicesFileSchema } from "@kaja/schema/config"

test("empty file validates: every section is optional", () => {
  const parsed = ServicesFileSchema.parse({})
  expect(parsed.location).toBeUndefined()
  expect(parsed.telegram).toBeUndefined()
  expect(parsed.api).toBeUndefined()
})

test("location group requires serviceUrl", () => {
  const parsed = ServicesFileSchema.parse({
    location: { serviceUrl: "https://geo.example.test" }
  })
  expect(parsed.location).toEqual({ serviceUrl: "https://geo.example.test" })
  expect(() => ServicesFileSchema.parse({ location: {} })).toThrow()
})

test("api group requires a valid baseUrl", () => {
  const parsed = ServicesFileSchema.parse({ api: { baseUrl: "https://api.kaja.io" } })
  expect(parsed.api).toEqual({ baseUrl: "https://api.kaja.io" })
  expect(() => ServicesFileSchema.parse({ api: { baseUrl: "not-a-url" } })).toThrow()
})

test("telegram group with valid allowedUserIds validates", () => {
  const parsed = ServicesFileSchema.parse({
    telegram: { allowedUserIds: [42, 7] }
  })
  expect(parsed.telegram).toEqual({ allowedUserIds: [42, 7] })
})

test("telegram group rejects an empty allowedUserIds array", () => {
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { allowedUserIds: [] }
    })
  ).toThrow()
})

test("telegram group rejects non-integer allowedUserIds entries", () => {
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { allowedUserIds: [1.5] }
    })
  ).toThrow()
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { allowedUserIds: ["42"] }
    })
  ).toThrow()
})
