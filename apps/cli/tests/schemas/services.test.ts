import { expect, test } from "bun:test"
import { ServicesFileSchema } from "../../schemas/services"

test("empty file validates: every section is optional", () => {
  const parsed = ServicesFileSchema.parse({})
  expect(parsed.location).toBeUndefined()
  expect(parsed.webSearch).toBeUndefined()
  expect(parsed.telegram).toBeUndefined()
  expect(parsed.api).toBeUndefined()
})

test("location group requires both fields together", () => {
  const parsed = ServicesFileSchema.parse({
    location: { serviceUrl: "https://geo.example.test", apiKey: "key" }
  })
  expect(parsed.location).toEqual({
    serviceUrl: "https://geo.example.test",
    apiKey: "key"
  })
  expect(() =>
    ServicesFileSchema.parse({
      location: { serviceUrl: "https://geo.example.test" }
    })
  ).toThrow()
})

test("webSearch group requires apiKey", () => {
  const parsed = ServicesFileSchema.parse({ webSearch: { apiKey: "key" } })
  expect(parsed.webSearch).toEqual({ apiKey: "key" })
  expect(() => ServicesFileSchema.parse({ webSearch: {} })).toThrow()
})

test("api group requires a valid baseUrl", () => {
  const parsed = ServicesFileSchema.parse({ api: { baseUrl: "https://api.kaja.io" } })
  expect(parsed.api).toEqual({ baseUrl: "https://api.kaja.io" })
  expect(() => ServicesFileSchema.parse({ api: { baseUrl: "not-a-url" } })).toThrow()
})

test("telegram group with valid botToken and allowedUserIds validates", () => {
  const parsed = ServicesFileSchema.parse({
    telegram: { botToken: "123:abc", allowedUserIds: [42, 7] }
  })
  expect(parsed.telegram).toEqual({
    botToken: "123:abc",
    allowedUserIds: [42, 7]
  })
})

test("telegram group requires botToken", () => {
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { allowedUserIds: [42] }
    })
  ).toThrow()
})

test("telegram group rejects an empty allowedUserIds array", () => {
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { botToken: "123:abc", allowedUserIds: [] }
    })
  ).toThrow()
})

test("telegram group rejects non-integer allowedUserIds entries", () => {
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { botToken: "123:abc", allowedUserIds: [1.5] }
    })
  ).toThrow()
  expect(() =>
    ServicesFileSchema.parse({
      telegram: { botToken: "123:abc", allowedUserIds: ["42"] }
    })
  ).toThrow()
})
