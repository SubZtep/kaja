import { afterEach, expect, test } from "bun:test"
import { detectLanguage, dictionaries, setLanguage, t } from "../../lib/i18n"

afterEach(() => setLanguage("en-GB"))

test("en-GB and hu dictionaries have the same keys", () => {
  expect([...dictionaries.hu.keys()].sort()).toEqual([...dictionaries["en-GB"].keys()].sort())
})

test("en-GB and nan-TW dictionaries have the same keys", () => {
  expect([...dictionaries["nan-TW"].keys()].sort()).toEqual([...dictionaries["en-GB"].keys()].sort())
})

test("interpolates params", () => {
  expect(t("cli.invalidConfig", { path: "/x/settings.toml" })).toBe("Invalid config file: /x/settings.toml")
})

test("leaves unknown placeholders alone", () => {
  expect(t("cli.invalidConfig", { nope: 1 })).toBe("Invalid config file: {path}")
})

test("unknown key falls back to the key itself", () => {
  expect(t("no.such.key")).toBe("no.such.key")
})

test("setLanguage switches the dictionary", () => {
  expect(t("doctor.cwd")).toBe("Directory: ")
  setLanguage("hu")
  expect(t("doctor.cwd")).toBe("Könyvtár: ")
})

test("detectLanguage maps Hungarian locales to hu, others to en-GB", () => {
  const saved = { ...process.env }
  try {
    process.env.LC_ALL = "hu_HU.UTF-8"
    expect(detectLanguage()).toBe("hu")
    process.env.LC_ALL = "en_GB.UTF-8"
    expect(detectLanguage()).toBe("en-GB")
    delete process.env.LC_ALL
    delete process.env.LC_MESSAGES
    process.env.LANG = "hu_HU"
    expect(detectLanguage()).toBe("hu")
  } finally {
    for (const key of ["LC_ALL", "LC_MESSAGES", "LANG"] as const) {
      const value = saved[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
