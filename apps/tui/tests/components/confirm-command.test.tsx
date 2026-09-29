import { expect, test } from "bun:test"
import { ConfirmCommand } from "../../components/layout/confirm-command"
import { renderForTest } from "../test-utils"

test("a cloud tool approval offers session and always, and picking one reports its scope", async () => {
  const answers: [boolean, string | undefined][] = []
  const t = renderForTest(
    <ConfirmCommand
      command="POST https://x.test/issues"
      description="wants to send this"
      kind="tool"
      running={false}
      scopes
      onResolve={(approved, scope) => answers.push([approved, scope])}
    />
  )
  await t.tick()
  expect(t.lastFrame()).toContain("this session")
  expect(t.lastFrame()).toContain("always allow")
  await t.press("\x1b[B") // down to "this session"
  await t.press("\r")
  await t.tick()
  expect(answers).toEqual([[true, "session"]])
  t.unmount()
  await t.waitUntilExit()
})

test("without scopes it is the plain yes / no menu", async () => {
  const t = renderForTest(<ConfirmCommand command="ls" description="list" running={false} onResolve={() => {}} />)
  await t.tick()
  expect(t.lastFrame()).not.toContain("session")
  expect(t.lastFrame()).not.toContain("always")
  t.unmount()
  await t.waitUntilExit()
})
