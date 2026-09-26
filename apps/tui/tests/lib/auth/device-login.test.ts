import { expect, test } from "bun:test"
import { localizeWebUrl } from "../../../lib/auth/device-login"

test("the device page opens in the terminal's language", () => {
  expect(localizeWebUrl("https://kaja.io/device?user_code=ABCD", "hu-HU")).toBe(
    "https://kaja.io/hu-HU/device?user_code=ABCD"
  )
  expect(localizeWebUrl("https://kaja.io/device", "en-US")).toBe("https://kaja.io/en-US/device")
  expect(localizeWebUrl("http://localhost:3000/device", "zh-TW")).toBe("http://localhost:3000/zh-TW/device")
})

test("British English is the unprefixed page, and an already localized one is left alone", () => {
  expect(localizeWebUrl("https://kaja.io/device?user_code=ABCD", "en-GB")).toBe("https://kaja.io/device?user_code=ABCD")
  expect(localizeWebUrl("https://kaja.io/nan-TW/device", "hu-HU")).toBe("https://kaja.io/nan-TW/device")
})
