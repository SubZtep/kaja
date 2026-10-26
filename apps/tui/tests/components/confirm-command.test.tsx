import { expect, test } from "bun:test"
import { ConfirmCommand } from "../../src/components/layout/confirm-command"
import { renderForTest } from "../test-utils"

type Answer = [boolean, string | undefined]

function mount(answers: Answer[], props: { running?: boolean; command?: string } = {}) {
  return renderForTest(
    <ConfirmCommand
      command={props.command ?? "rm -rf ./build"}
      description="Remove the build folder"
      running={props.running ?? false}
      onResolve={(approved, feedback) => answers.push([approved, feedback])}
    />
  )
}

test("shows the question, both answers and the field, but not the command", async () => {
  const t = mount([], { command: "rm -rf ./build" })
  await t.tick()
  expect(t.lastFrame()).toContain("Remove the build folder")
  expect(t.lastFrame()).toContain("Yes, run it")
  expect(t.lastFrame()).toContain("No, cancel")
  expect(t.lastFrame()).toContain("Or type what to do instead")
  expect(t.lastFrame()).not.toContain("rm -rf")
  expect(t.lastFrame()).not.toContain("↓") // a plain border: only a question's answer gets the arrows
  t.unmount()
  await t.waitUntilExit()
})

test("Enter on the list approves, and the second row declines", async () => {
  const answers: Answer[] = []
  const t = mount(answers)
  await t.tick()
  await t.press("\r")
  await t.press("\x1b[B")
  await t.press("\r")
  expect(answers).toEqual([
    [true, undefined],
    [false, undefined]
  ])
  t.unmount()
  await t.waitUntilExit()
})

test("typing hands the keys to the field: Enter declines with what was written", async () => {
  const answers: Answer[] = []
  const t = mount(answers)
  await t.tick()
  await t.press("use trash instead")
  expect(t.lastFrame()).toContain("use trash instead")
  await t.press("\r")
  expect(answers).toEqual([[false, "use trash instead"]])
  t.unmount()
  await t.waitUntilExit()
})

test("Esc empties the field and returns to the list, and Esc on the list declines", async () => {
  const answers: Answer[] = []
  const t = mount(answers)
  await t.tick()
  await t.press("nope")
  await t.press("\x1b")
  expect(t.lastFrame()).not.toContain("nope")
  expect(answers).toEqual([])
  await t.press("\r") // the list has the keys again
  expect(answers).toEqual([[true, undefined]])
  await t.press("\x1b")
  expect(answers.at(-1)).toEqual([false, undefined])
  t.unmount()
  await t.waitUntilExit()
})

test("while running it is a status line, no menu and no field", async () => {
  const t = mount([], { running: true })
  await t.tick()
  expect(t.lastFrame()).toContain("Running")
  expect(t.lastFrame()).not.toContain("Yes, run it")
  expect(t.lastFrame()).not.toContain("Or type")
  t.unmount()
  await t.waitUntilExit()
})
