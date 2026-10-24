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
  expect(matchLocale("es")).toBe("es-ES")
  expect(matchLocale("ja-JP")).toBe("ja-JP")
  expect(matchLocale("ko")).toBe("ko-KR")
  expect(matchLocale("de")).toBe("de-DE")
  expect(matchLocale("fr")).toBe("fr-FR")
  expect(matchLocale("pt_BR")).toBe("pt-BR")
  expect(matchLocale("nan")).toBe("nan-TW")
})

test("an unsupported or empty tag matches nothing", () => {
  expect(matchLocale("xx-XX")).toBeUndefined()
  expect(matchLocale("")).toBeUndefined()
  expect(matchLocale(undefined)).toBeUndefined()
})
