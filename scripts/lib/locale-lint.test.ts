import { expect, test } from "bun:test"
import { copiedAcross, wrongScript } from "./locale-lint"

test("Korean in the German file, and German in the Korean one, are caught", () => {
  expect(wrongScript("de-DE", "Settings file: {path}", "잘못된 설정 파일: {path}")).toBe("has Korean Hangul in it")
  expect(wrongScript("ko-KR", "Telegram unlinked", "Telegram getrennt")).toBe("not written in ko-KR's script")
  expect(wrongScript("fr-FR", "Sign in", "サインイン")).toBe("has Japanese kana in it")
  expect(wrongScript("es-ES", "Sign in", "登入")).toBe("has Chinese characters in it")
})

test("translations in their own script pass", () => {
  expect(wrongScript("de-DE", "Sign in", "Anmelden")).toBeUndefined()
  expect(wrongScript("ko-KR", "Sign in", "로그인")).toBeUndefined()
  expect(wrongScript("ja-JP", "Sign in", "サインイン")).toBeUndefined()
  expect(wrongScript("zh-TW", "Sign in", "登入")).toBeUndefined()
  expect(wrongScript("hu-HU", "Bye", "Pá, pá!")).toBeUndefined()
})

test("kept English terms, bare params and placeholders aren't another language", () => {
  expect(wrongScript("ko-KR", "Providers", "Provider")).toBeUndefined()
  expect(wrongScript("zh-TW", "Tokens", "Token")).toBeUndefined()
  expect(wrongScript("zh-TW", "{part}: {error}", "{part}：{error}")).toBeUndefined()
  expect(wrongScript("ja-JP", "Telegram", "Telegram")).toBeUndefined()
  expect(wrongScript("ko-KR", "Sign in", "[ko-KR] lorem ipsum")).toBeUndefined()
})

test("the same long text in two unrelated languages is a copy; related ones may share a phrase", () => {
  const english = new Map([
    ["a", "The Kaja bot won't answer this Telegram account"],
    ["b", "Usage: kaja abilities [update]"]
  ])
  const byLocale = new Map([
    ["de-DE", new Map([["a", "Der Kaja-Bot antwortet diesem Telegram-Konto nicht"]])],
    ["fr-FR", new Map([["a", "Der Kaja-Bot antwortet diesem Telegram-Konto nicht"]])],
    ["es-ES", new Map([["b", "Uso: kaja abilities [update]"]])],
    ["pt-BR", new Map([["b", "Uso: kaja abilities [update]"]])]
  ])
  expect(copiedAcross(english, byLocale)).toEqual(new Map([["a", ["de-DE", "fr-FR"]]]))
})
