import { expect, test } from "bun:test"
import { InputPrompt, YesNoPrompt } from "../../components/secret-prompt"
import { renderForTest } from "../test-utils"

test("masks input and submits the trimmed value; an empty Enter skips", async () => {
  const values: string[] = []
  let skipped = 0
  const t = renderForTest(
    <InputPrompt
      secret
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
    <InputPrompt
      secret
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

test("a refused answer keeps the question open with the reason; without onSkip an empty answer is checked too", async () => {
  const values: string[] = []
  const t = renderForTest(
    <InputPrompt
      title="Model id?"
      hint="One per line"
      validate={value => (value ? undefined : "A model is needed.")}
      onSubmit={value => values.push(value)}
    />
  )
  await t.tick()
  expect(t.lastFrame()).toContain("One per line")
  await t.press("\r")
  expect(t.lastFrame()).toContain("A model is needed.")
  expect(values).toEqual([])
  for (const ch of "m1") await t.press(ch)
  await t.press("\r")
  expect(values).toEqual(["m1"])
  t.unmount()
  await t.waitUntilExit()
})

test("a yes/no prompt defaults to no; the second option is yes", async () => {
  const answers: boolean[] = []
  const prompt = (
    <YesNoPrompt title="It didn't work." yesLabel="Save" noLabel="Don't" onResolve={yes => answers.push(yes)} />
  )
  const first = renderForTest(prompt)
  await first.tick()
  await first.press("\r")
  first.unmount()
  await first.waitUntilExit()

  const second = renderForTest(prompt)
  await second.tick()
  await second.press("\x1b[B")
  await second.press("\r")
  second.unmount()
  await second.waitUntilExit()

  expect(answers).toEqual([false, true])
})
