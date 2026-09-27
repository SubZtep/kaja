import { expect, test } from "bun:test"
import { matchLocale } from "../locale"

test("a supported tag matches exactly, in any case", () => {
  expect(matchLocale("hu-HU")).toBe("hu-HU")
  expect(matchLocale("zh-tw")).toBe("zh-TW")
  expect(matchLocale("en_US")).toBe("en-US")
})

test("any other tag matches by its language alone", () => {
  expect(matchLocale("hu")).toBe("hu-HU")
  expect(matchLocale("en")).toBe("en-GB")
  expect(matchLocale("en-AU")).toBe("en-GB")
  expect(matchLocale("zh-Hant")).toBe("zh-TW")
  expect(matchLocale("zh_CN")).toBe("zh-TW")
  expect(matchLocale("nan")).toBe("nan-TW")
})

test("an unsupported or empty tag matches nothing", () => {
  expect(matchLocale("de-DE")).toBeUndefined()
  expect(matchLocale("")).toBeUndefined()
  expect(matchLocale(undefined)).toBeUndefined()
})
