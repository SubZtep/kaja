import { expect, test } from "bun:test"
import { locales } from "@kaja/shared"
import { dictionaries, toLocale, translator } from "../../src/core/i18n"
import { getChangeEmailHtml } from "../../src/emails/ChangeEmail"
import { botLanguage, localeFromTelegram } from "../../src/features/telegram/language"

const WIDGET_LOCALES = `${import.meta.dir}/../../widgets/locales`

for (const locale of locales.filter(locale => locale !== "en-GB")) {
  test(`en-GB and ${locale} dictionaries have the same keys`, () => {
    expect([...dictionaries[locale].keys()].sort()).toEqual([...dictionaries["en-GB"].keys()].sort())
  })

  test(`the widget's en-GB and ${locale} strings have the same keys`, async () => {
    const read = async (code: string) =>
      Object.keys(Bun.TOML.parse(await Bun.file(`${WIDGET_LOCALES}/${code}.toml`).text()))
    expect((await read(locale)).sort()).toEqual((await read("en-GB")).sort())
  })
}

test("an unsupported or missing locale falls back to en-GB", () => {
  expect(toLocale("hu-HU")).toBe("hu-HU")
  expect(toLocale("xx-XX")).toBe("en-GB")
  expect(toLocale(null)).toBe("en-GB")
})

test("interpolates params and falls back to the key", () => {
  const t = translator("en-GB")
  expect(t("email.greeting", { name: " Anna" })).toBe("Hey-ho Anna 👋")
  expect(t("no.such.key")).toBe("no.such.key")
})

test("an email renders in the user's language", async () => {
  const user = {
    id: "1",
    name: "Anna Kiss",
    email: "old@example.com",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const payload = { user: { ...user, locale: "hu-HU" }, url: "https://kaja.io/x", newEmail: "new@example.com" }
  const html = await getChangeEmailHtml(payload, { locale: "hu-HU", t: translator("hu-HU") })
  expect(html).toContain('lang="hu-HU"')
  expect(html).toContain(translator("hu-HU")("email.changeEmailLink"))
  expect(html).not.toContain(translator("en-GB")("email.changeEmailLink"))
})

test("a Telegram app language maps to a supported locale", () => {
  expect(localeFromTelegram("hu")).toBe("hu-HU")
  expect(localeFromTelegram("zh-hant")).toBe("zh-TW")
  expect(localeFromTelegram("zh-hans")).toBe("zh-TW")
  expect(localeFromTelegram("en-us")).toBe("en-US")
  expect(localeFromTelegram("en")).toBe("en-GB")
  expect(localeFromTelegram("de")).toBe("en-GB")
  expect(localeFromTelegram(undefined)).toBe("en-GB")
})

test("the bot uses the account's saved language over the Telegram app's", () => {
  expect(botLanguage("zh-TW", "hu").locale).toBe("zh-TW")
  expect(botLanguage(null, "hu").locale).toBe("hu-HU")
})
