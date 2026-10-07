import { expect, test } from "bun:test"
import { TOML } from "bun"
import { groupTomlTables, stringifyToml } from "../toml"

test("stringifyToml groups sub-tables under their parent's header and drops empty tables", () => {
  const text = stringifyToml({
    telegram: { bot_token: "t", owner_ids: [1] },
    providers: { fireworks: { api_key: "a" }, xai: { api_key: "b" } },
    abilities: {}
  })
  expect(text).toBe(
    '[telegram]\nbot_token = "t"\nowner_ids = [1]\n\n' +
      '[providers]\n  [providers.fireworks]\n  api_key = "a"\n\n  [providers.xai]\n  api_key = "b"\n'
  )
  expect(TOML.parse(text)).toEqual({
    telegram: { bot_token: "t", owner_ids: [1] },
    providers: { fireworks: { api_key: "a" }, xai: { api_key: "b" } }
  })
})

test("stringifyToml quotes keys that need it and writes nothing for an empty file", () => {
  expect(stringifyToml({ abilities: { "brave-search": { api_key: "c" } } })).toBe(
    '[abilities]\n  [abilities.brave-search]\n  api_key = "c"\n'
  )
  expect(stringifyToml({ providers: {}, abilities: { x: {} } })).toBe("")
})

test("groupTomlTables indents each sub-table, comments included, under a bare or valued header", () => {
  expect(groupTomlTables("[providers]", ['# local\n[providers.llama]\nbase_url = "x"'])).toBe(
    '[providers]\n  # local\n  [providers.llama]\n  base_url = "x"'
  )
  expect(groupTomlTables("[a]\nk = 1", ["[a.b]\nv = 2"])).toBe("[a]\nk = 1\n\n  [a.b]\n  v = 2")
  expect(groupTomlTables("[a]", [])).toBe("[a]")
})
