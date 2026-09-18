import { expect, test } from "bun:test"
import { SaveAnywayPrompt, SecretPrompt } from "../../components/secret-prompt"
import { renderForTest } from "../test-utils"

test("masks input and submits the trimmed value; an empty Enter skips", async () => {
  const values: string[] = []
  let skipped = 0
  const t = renderForTest(
    <SecretPrompt
      title="github needs an API key (header Authorization)."
      onSubmit={value => values.push(value)}
      onSkip={() => {
        skipped++
      }}
    />
  )
  await t.tick()
  expect(t.lastFrame()).toContain("github needs an API key (header Authorization).")
  await t.press("\r")
  expect(skipped).toBe(1)
  for (const ch of "s3cret") await t.press(ch)
  expect(t.lastFrame()).not.toContain("s3cret")
  await t.press("\r")
  expect(values).toEqual(["s3cret"])
  t.unmount()
  await t.waitUntilExit()
})

test("escape skips", async () => {
  let skipped = false
  const t = renderForTest(
    <SecretPrompt
      title="x"
      onSubmit={() => {}}
      onSkip={() => {
        skipped = true
      }}
    />
  )
  await t.tick()
  await t.press("\x1b")
  expect(skipped).toBe(true)
  t.unmount()
  await t.waitUntilExit()
})

test("save-anyway defaults to not saving; the second option saves", async () => {
  const answers: boolean[] = []
  const first = renderForTest(<SaveAnywayPrompt title="It didn't work." onResolve={save => answers.push(save)} />)
  await first.tick()
  await first.press("\r")
  first.unmount()
  await first.waitUntilExit()

  const second = renderForTest(<SaveAnywayPrompt title="It didn't work." onResolve={save => answers.push(save)} />)
  await second.tick()
  await second.press("\x1b[B")
  await second.press("\r")
  second.unmount()
  await second.waitUntilExit()

  expect(answers).toEqual([false, true])
})
