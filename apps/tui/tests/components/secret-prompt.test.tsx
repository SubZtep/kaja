import { expect, test } from "bun:test"
import { InputPrompt, maskSecret, YesNoPrompt } from "../../src/components/secret-prompt"
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

/** Polls until `frame()` contains `text`; the live check waits for typing to pause, so a fixed sleep would be a guess. */
async function waitForText(frame: () => string | undefined, text: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (!frame()?.includes(text) && Date.now() < deadline) await Bun.sleep(50)
  expect(frame()).toContain(text)
}

test("validate speaks up while typing, before Enter", async () => {
  const t = renderForTest(
    <InputPrompt title="x" validate={v => (v.startsWith("http") ? undefined : "Not an address")} onSubmit={() => {}} />
  )
  await t.tick()
  await t.press("f")
  expect(t.lastFrame()).toContain("Not an address")
  t.unmount()
  await t.waitUntilExit()
})

test("the check runs once typing pauses, on the final answer only", async () => {
  const checked: string[] = []
  const t = renderForTest(
    <InputPrompt
      secret
      title="x"
      check={async value => {
        checked.push(value)
        return { tone: "ok", note: "Accepted" }
      }}
      onSubmit={() => {}}
    />
  )
  await t.tick()
  for (const ch of "key") await t.press(ch)
  await waitForText(t.lastFrame, "✓ Accepted")
  expect(checked).toEqual(["key"])
  t.unmount()
  await t.waitUntilExit()
})

test("a refused answer says so at the right of the field, and the hint that Enter saves it anyway", async () => {
  const values: string[] = []
  const t = renderForTest(
    <InputPrompt
      secret
      title="x"
      check={async () => ({ tone: "bad", note: "Refused" })}
      onSubmit={value => values.push(value)}
    />
  )
  await t.tick()
  await t.press("bad-key-0123456789")
  await waitForText(t.lastFrame, "✗ Refused")
  expect(t.lastFrame()).toContain("Check for a typo, or Enter saves it anyway")
  // Masked, but its last 4 show, so a wrong paste is spotted
  expect(t.lastFrame()).toContain("••••6789")
  expect(t.lastFrame()).not.toContain("bad-key")
  await t.press("\r")
  expect(values).toEqual(["bad-key-0123456789"])
  t.unmount()
  await t.waitUntilExit()
})

test("a short secret shows no characters at all", () => {
  expect(maskSecret("short")).toBe("•".repeat(24))
  expect(maskSecret("")).toBe("")
  expect(maskSecret("sk-0123456789abcdef")).toBe(`${"•".repeat(24)}cdef`)
})

test("a warning doesn't hold Enter back", async () => {
  const values: string[] = []
  const t = renderForTest(
    <InputPrompt
      title="x"
      defaultValue="http://localhost:11434/v1"
      check={async () => ({ tone: "warn", note: "Nothing answers there yet" })}
      onSubmit={value => values.push(value)}
    />
  )
  await waitForText(t.lastFrame, "! Nothing answers there yet")
  await t.press("\r")
  expect(values).toEqual(["http://localhost:11434/v1"])
  t.unmount()
  await t.waitUntilExit()
})
