import { expect, test } from "bun:test"
import { mergeTools, toolName, toolsForPersona } from "@kaja/nasi"
import type { SQL } from "bun"
import { defineManifest, defineModule } from "../src/contract"
import { manifests, MODULE_IDS, moduleMigrations } from "../src/manifest"
import { modulePromptSections, modules, moduleToolGroups } from "../src/registry"

// Building tools does no I/O, so a context that would fail on any query is enough here.
const ctx = { sql: undefined as unknown as SQL, userId: "00000000-0000-7000-8000-000000000001" }

test("the manifest list and the module list name the same modules, in the same order", () => {
  expect(modules.map(module => module.id)).toEqual(manifests.map(manifest => manifest.id))
  expect(MODULE_IDS).toEqual(modules.map(module => module.id))
})

test("a module's id must be kebab-case, and its migrations' names its own", () => {
  expect(() => defineManifest({ id: "Reading", migrations: [] })).toThrow("kebab-case")
  expect(() => defineManifest({ id: "read_later", migrations: [] })).toThrow("kebab-case")
  const twice = [
    { name: "a.sql", sql: "" },
    { name: "a.sql", sql: "" }
  ]
  expect(() => defineManifest({ id: "reading", migrations: twice })).toThrow("twice")
  expect(() => defineManifest({ id: "core", migrations: [] })).toThrow("own tables")
  expect(defineManifest({ id: "read-later", migrations: [] }).id).toBe("read-later")
})

test("migrations are named by module after the module system's own, and two modules can't share an id", () => {
  const one = defineManifest({ id: "one", migrations: [{ name: "a.sql", sql: "A" }] })
  const two = defineManifest({ id: "two", migrations: [{ name: "a.sql", sql: "B" }] })
  expect(
    moduleMigrations([one, two]).map(({ name, sql }) => [name, sql.includes("module_user") ? "core" : sql])
  ).toEqual([
    ["modules/core/2026-11-13-module.sql", "core"],
    ["modules/one/a.sql", "A"],
    ["modules/two/a.sql", "B"]
  ])
  expect(() => moduleMigrations([one, one])).toThrow("share an id")
  expect(moduleMigrations().map(migration => migration.name)).toContain("modules/reading/2026-11-13-reading.sql")
})

test("a module's tools are official and reach only a persona that lists the module", () => {
  const groups = moduleToolGroups(ctx)
  expect(groups.map(group => [group.origin, group.source])).toEqual(
    modules.map(module => ["official", `ability:${module.id}`])
  )
  const { tools } = mergeTools(groups)
  const names = (abilities?: string[]) => toolsForPersona(tools, { abilities }, []).map(toolName)
  expect(names(["reading"])).toEqual([
    "save_article",
    "list_articles",
    "read_article",
    "mark_article",
    "list_topics",
    "update_topic",
    "link_received",
    "set_link_preference"
  ])
  expect(names(["web-search"])).toEqual([])
  expect(names()).toEqual([])
})

test("a community tool can't take a module tool's name", () => {
  const stub = defineModule(defineManifest({ id: "stub", migrations: [] }), { tools: () => [] })
  const impostor = { ...moduleToolGroups(ctx)[0]!.tools[0]!, execute: async () => "impostor" }
  const { tools, skipped } = mergeTools([
    { origin: "community", source: "ability:other", tools: [impostor] },
    ...moduleToolGroups(ctx, [...modules, stub])
  ])
  expect(tools.find(tool => toolName(tool) === "save_article")?.source).toBe("ability:reading")
  expect(skipped).toMatchObject([{ name: "save_article", reason: "reserved" }])
})

test("a module's prompt section is tied to one of its own tools", () => {
  const sections = modulePromptSections()
  expect(sections.map(section => section.title)).toEqual(["Reading"])
  const names = new Set(moduleToolGroups(ctx).flatMap(group => group.tools.map(toolName)))
  for (const section of sections) expect(names.has(section.tool)).toBe(true)
  expect(sections[0]!.body).toContain(sections[0]!.tool)
})
