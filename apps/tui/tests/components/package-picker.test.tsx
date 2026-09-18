import { expect, test } from "bun:test"
import { PackagePicker, type PickerSkill } from "../../components/package-picker"
import { renderForTest } from "../test-utils"

const skills: PickerSkill[] = [
  { name: "pdf", description: "Work with PDF files.", local: false },
  { name: "notes", description: "Keep notes.", local: true },
  { name: "broken", error: "no SKILL.md", local: true }
]

test("lists skills with a local tag, shows broken ones apart, and submits the toggled selection", async () => {
  const submitted: string[][] = []
  const t = renderForTest(
    <PackagePicker skills={skills} enabled={["pdf"]} onSubmit={names => submitted.push(names)} onCancel={() => {}} />
  )
  await t.tick()

  const frame = t.lastFrame() ?? ""
  expect(frame).toContain("pdf")
  expect(frame).toContain("notes [local]")
  expect(frame).toContain("broken: no SKILL.md")

  await t.press("\x1b[B")
  await t.press(" ")
  await t.press("\r")
  expect(submitted).toHaveLength(1)
  expect([...submitted[0]!].sort()).toEqual(["notes", "pdf"])

  t.unmount()
  await t.waitUntilExit()
})

test("escape cancels without submitting", async () => {
  let cancelled = false
  const submitted: string[][] = []
  const t = renderForTest(
    <PackagePicker
      skills={skills}
      enabled={[]}
      onSubmit={names => submitted.push(names)}
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
