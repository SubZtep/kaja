import { expect, test } from "bun:test"
import { PackagePicker, type PickerItem, type PickerSelection } from "../../components/package-picker"
import { renderForTest } from "../test-utils"

const items: PickerItem[] = [
  { type: "skill", name: "pdf", description: "Work with PDF files.", local: false },
  { type: "skill", name: "notes", description: "Keep notes.", local: true },
  { type: "skill", name: "broken", error: "no SKILL.md", local: true },
  { type: "persona", name: "care", description: "Self-care companion", local: false },
  { type: "tool", name: "open-meteo", description: "Weather.", local: false, domain: "api.open-meteo.com" },
  { type: "tool", name: "github", description: "Issues.", local: false, domain: "api.github.com", key: "required" },
  { type: "mcp", name: "docs", description: "Docs.", local: false, domain: "mcp.docs.test", key: "optional" },
  { type: "mcp", name: "browser", description: "Browser.", local: false, runs: "bunx browser-mcp" }
]

test("lists skills, personas and tools with tags, domains and key needs, broken ones apart", async () => {
  const t = renderForTest(
    <PackagePicker
      items={items}
      enabled={{ skills: [], personas: [], tools: [], mcp: [] }}
      onSubmit={() => {}}
      onCancel={() => {}}
    />
  )
  await t.tick()
  const frame = t.lastFrame() ?? ""
  expect(frame).toContain("skill   pdf")
  expect(frame).toContain("notes [local]")
  expect(frame).toContain("persona care  Self-care companion")
  expect(frame).toContain("tool    open-meteo  api.open-meteo.com · no key")
  expect(frame).toContain("tool    github  api.github.com · needs a key")
  expect(frame).toContain("mcp     docs  mcp.docs.test · optional key")
  expect(frame).toContain("mcp     browser  runs: bunx browser-mcp · no key")
  expect(frame).toContain("broken: no SKILL.md")
  t.unmount()
  await t.waitUntilExit()
})

test("submits the toggled selection split by type", async () => {
  const submitted: PickerSelection[] = []
  const t = renderForTest(
    <PackagePicker
      items={items}
      enabled={{ skills: ["pdf"], personas: [], tools: [], mcp: [] }}
      onSubmit={selection => submitted.push(selection)}
      onCancel={() => {}}
    />
  )
  await t.tick()
  // Down past notes to care (broken items aren't in the list) and toggle it, then open-meteo, then submit.
  await t.press("\x1b[B")
  await t.press("\x1b[B")
  await t.press(" ")
  await t.press("\x1b[B")
  await t.press(" ")
  await t.press("\r")
  expect(submitted).toEqual([{ skills: ["pdf"], personas: ["care"], tools: ["open-meteo"], mcp: [] }])
  t.unmount()
  await t.waitUntilExit()
})

test("escape cancels without submitting", async () => {
  let cancelled = false
  const submitted: PickerSelection[] = []
  const t = renderForTest(
    <PackagePicker
      items={items}
      enabled={{ skills: [], personas: [], tools: [], mcp: [] }}
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
