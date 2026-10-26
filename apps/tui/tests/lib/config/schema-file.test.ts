import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { tombiSchemas } from "@kaja/schema/tombi"
import { file, write } from "bun"
import { writeSchemaCopy } from "../../../src/lib/config/schema-file"

const repoSchema = join(import.meta.dir, "../../../../../packages/schema/json/settings.json")

function freshDir() {
  return `${tmpdir()}/kaja-test-schema-file-${Math.random()}`
}

test("a missing copy is written beside the config file", async () => {
  const dir = freshDir()
  await writeSchemaCopy(join(dir, "settings.toml"))
  expect(await file(join(dir, "schemas", "settings.json")).json()).toEqual(tombiSchemas["settings.json"])
})

test("a copy with the same schema in another layout is left alone", async () => {
  const dir = freshDir()
  const target = join(dir, "schemas", "settings.json")
  const formatted = await file(repoSchema).text()
  await write(target, formatted)
  await writeSchemaCopy(join(dir, "settings.bak.2.toml"))
  expect(await file(target).text()).toBe(formatted)
})

test("a stale or broken copy is replaced", async () => {
  const dir = freshDir()
  const target = join(dir, "schemas", "models.json")
  for (const stale of ['{"type":"object"}', "not json"]) {
    await write(target, stale)
    await writeSchemaCopy(join(dir, "models.toml"))
    expect(await file(target).json()).toEqual(tombiSchemas["models.json"])
  }
})
