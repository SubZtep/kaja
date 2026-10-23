import { expect, test } from "bun:test"
import { UserInput } from "../../components/layout/user-input"
import { renderForTest } from "../test-utils"

test('plain typing works, and "/" is just a literal character', async () => {
  const t = renderForTest(<UserInput pending={false} speaking={false} send={async () => {}} />)
  await t.tick()

  await t.press("hello")
  expect(t.lastFrame()).toContain("hello")
  await t.press("/world")
  expect(t.lastFrame()).toContain("hello/world")

  t.unmount()
  await t.waitUntilExit()
})

test("kitty key reports type once: releases, bare modifiers and shifted text change nothing extra", async () => {
  const t = renderForTest(<UserInput pending={false} speaking={false} send={async () => {}} />)
  await t.tick()

  await t.press("\x1b[104u") // h down
  await t.press("\x1b[104;1:3u") // h up
  await t.press("\x1b[57441;2u") // Shift down
  await t.press("\x1b[105;2;73u") // Shift+I with its text
  await t.press("\x1b[105;2:3;73u") // up
  await t.press("\x1b[57441;1:3u") // Shift up
  await t.press("\x1b[57442;5u") // Ctrl down, alone
  await t.press("\x1b[57442;1:3u")
  expect(t.lastFrame()).toContain("hI")
  expect(t.lastFrame()).not.toContain("hII")
  expect(t.lastFrame()).not.toContain("hh")

  t.unmount()
  await t.waitUntilExit()
})

test("mic stays deaf and shows x while the agent speaks", async () => {
  const t = renderForTest(<UserInput pending={false} speaking={true} send={async () => {}} />)
  await t.tick()

  // Ctrl+T turns the mic on, but with the agent speaking it must show as muted — and useDictation never sees listening=true, so no ffmpeg or websocket is spawned (which also keeps this test side-effect-free).
  await t.press("\x14")
  // ASCII status prefix: "x " = muted while agent speaks
  expect(t.lastFrame()).toContain("x ")

  t.unmount()
  await t.waitUntilExit()
})

test("up/down recall prompt history shell-style, preserving the draft", async () => {
  const t = renderForTest(
    <UserInput pending={false} speaking={false} send={async () => {}} history={["second", "first"]} />
  )
  await t.tick()

  // typing a draft, then ↑ walks toward older prompts
  await t.press("draft")
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("second")
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("first")

  // at the oldest entry ↑ stays put
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("first")

  // ↓ walks back and finally restores the draft
  await t.press("\x1b[B")
  expect(t.lastFrame()).toContain("second")
  await t.press("\x1b[B")
  expect(t.lastFrame()).toContain("draft")

  // editing a recalled entry makes it the new draft: ↑ starts from the newest entry again, ↓ brings the edited text back
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("second")
  await t.press("X")
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("second")
  expect(t.lastFrame()).not.toContain("secondX")
  await t.press("\x1b[B")
  expect(t.lastFrame()).toContain("secondX")

  t.unmount()
  await t.waitUntilExit()
})

test("in a multiline draft, arrows move the cursor before recalling", async () => {
  const t = renderForTest(<UserInput pending={false} speaking={false} send={async () => {}} history={["recalled"]} />)
  await t.tick()

  // two-line draft (bare LF inserts a newline), cursor ends on the last line
  await t.press("one")
  await t.press("\x0a")
  await t.press("two")
  expect(t.lastFrame()).toContain("one")
  expect(t.lastFrame()).toContain("two")

  // first ↑ only moves the cursor to the first line — text unchanged
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("one")
  expect(t.lastFrame()).toContain("two")

  // second ↑ (cursor already on the first line) recalls history
  await t.press("\x1b[A")
  expect(t.lastFrame()).toContain("recalled")
  expect(t.lastFrame()).not.toContain("one")

  t.unmount()
  await t.waitUntilExit()
})

test("the border turns to arrows only while an ask_user answer is awaited", async () => {
  const t = renderForTest(<UserInput pending={false} speaking={false} send={async () => {}} />)
  await t.tick()
  expect(t.lastFrame()).not.toContain("↓")
  t.unmount()
  await t.waitUntilExit()

  const asking = renderForTest(<UserInput pending={false} speaking={false} asking send={async () => {}} />)
  await asking.tick()
  expect(asking.lastFrame()).toContain("↓")
  asking.unmount()
  await asking.waitUntilExit()
})

test("a given placeholder replaces the chat one, and the draft is reported as it changes", async () => {
  const drafts: string[] = []
  const t = renderForTest(
    <UserInput
      pending={false}
      speaking={false}
      send={async () => {}}
      placeholder="Type your answer…"
      onDraft={draft => drafts.push(draft)}
    />
  )
  await t.tick()
  expect(t.lastFrame()).toContain("Type your answer")
  expect(t.lastFrame()).not.toContain("Type something")

  await t.press("hi")
  expect(drafts.at(-1)).toBe("hi")
  await t.press("\r")
  await t.tick()
  expect(drafts.at(-1)).toBe("")

  t.unmount()
  await t.waitUntilExit()
})

test("a mic switch kept by the caller is what shows, and Ctrl+T asks to flip it instead of flipping its own", async () => {
  const asked: boolean[] = []
  const t = renderForTest(
    <UserInput pending={false} speaking mic onMicChange={mic => asked.push(mic)} send={async () => {}} />
  )
  await t.tick()
  expect(t.lastFrame()).toContain("x ") // on, but muted while the agent speaks
  await t.press("\x14")
  expect(asked).toEqual([false])
  expect(t.lastFrame()).toContain("x ")

  t.unmount()
  await t.waitUntilExit()
})
