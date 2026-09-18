import { expect, test } from "bun:test"
import { PackagePicker, type PickerItem, type PickerSelection } from "../../components/package-picker"
import { renderForTest } from "../test-utils"

const items: PickerItem[] = [
  { type: "skill", name: "pdf", description: "Work with PDF files.", local: false },
  { type: "skill", name: "notes", description: "Keep notes.", local: true },
  { type: "skill", name: "broken", error: "no SKILL.md", local: true },
  { type: "tool", name: "open-meteo", description: "Weather.", local: false, domain: "api.open-meteo.com" },
  { type: "tool", name: "github", description: "Issues.", local: false, domain: "api.github.com", key: "required" },
  { type: "mcp", name: "docs", description: "Docs.", local: false, domain: "mcp.docs.test", key: "optional" },
  { type: "mcp", name: "browser", description: "Browser.", local: false, runs: "bunx browser-mcp" }
]

test("lists skills and tools with tags, domains and key needs, broken ones apart", async () => {
  const t = renderForTest(
    <PackagePicker items={items} enabled={{ skills: [], tools: [], mcp: [] }} onSubmit={() => {}} onCancel={() => {}} />
  )
  await t.tick()
  const frame = t.lastFrame() ?? ""
  expect(frame).toContain("skill pdf")
  expect(frame).toContain("notes [local]")
  expect(frame).toContain("tool  open-meteo  api.open-meteo.com · no key")
  expect(frame).toContain("tool  github  api.github.com · needs a key")
  expect(frame).toContain("mcp   docs  mcp.docs.test · optional key")
  expect(frame).toContain("mcp   browser  runs: bunx browser-mcp · no key")
  expect(frame).toContain("broken: no SKILL.md")
  t.unmount()
  await t.waitUntilExit()
})

test("submits the toggled selection split into skills and tools", async () => {
  const submitted: PickerSelection[] = []
  const t = renderForTest(
    <PackagePicker
      items={items}
      enabled={{ skills: ["pdf"], tools: [], mcp: [] }}
      onSubmit={selection => submitted.push(selection)}
      onCancel={() => {}}
    />
  )
  await t.tick()
  // Down past notes to open-meteo (broken items aren't in the list), toggle it, submit.
  await t.press("\x1b[B")
  await t.press("\x1b[B")
  await t.press(" ")
  await t.press("\r")
  expect(submitted).toEqual([{ skills: ["pdf"], tools: ["open-meteo"], mcp: [] }])
  t.unmount()
  await t.waitUntilExit()
})

test("escape cancels without submitting", async () => {
  let cancelled = false
  const submitted: PickerSelection[] = []
  const t = renderForTest(
    <PackagePicker
      items={items}
      enabled={{ skills: [], tools: [], mcp: [] }}
      onSubmit={selection => submitted.push(selection)}
      onCancel={() => {
        cancelled = true
      }}
    />
  )
  await t.tick()
  await t.press("\x1b")
  expect(cancelled).toBe(true)
  expect(submitted).toEqual([])
  t.unmount()
  await t.waitUntilExit()
})
