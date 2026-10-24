import { afterEach, beforeEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { renderForTest } from "../test-utils"

// fireHook would otherwise run the machine's own hooks.toml
process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-monster`

const { emote, Monster, monsterWidth } = await import("../../components/layout/monster")
const { fireHook } = await import("../../lib/config/hooks")

/** Polls the last frame; a loaded machine gets a generous deadline. */
async function waitForFrame(view: ReturnType<typeof renderForTest>, match: (frame: string) => boolean) {
  for (let i = 0; i < 200 && !match(view.lastFrame()); i++) await Bun.sleep(20)
  return view.lastFrame()
}

let view: ReturnType<typeof renderForTest> | undefined

// Emotions are shared by every monster, other test files' included, so each test starts calm
beforeEach(async () => {
  emote("worked", 1)
  await Bun.sleep(20)
})

afterEach(() => {
  view?.unmount()
  view = undefined
})

test("idles on its default face, with the wand when asked", async () => {
  view = renderForTest(<Monster wand />)
  expect(await waitForFrame(view, frame => frame.includes("🪄"))).toContain("༼☉ɷ⊙༽🪄")
  expect(monsterWidth()).toBe(5)
  expect(monsterWidth(true)).toBe(7)
})

test("a mood holds its face", async () => {
  view = renderForTest(<Monster mood="worked" />)
  expect(await waitForFrame(view, frame => frame.includes("༼"))).toContain("༼^ω^༽")
})

test("an emote shows for a moment, then the monster goes back to its own face", async () => {
  view = renderForTest(<Monster mood="worked" />)
  await waitForFrame(view, frame => frame.includes("༼"))
  emote("problem", 100)
  expect(await waitForFrame(view, frame => frame.includes("༼°ω°༽"))).toContain("༼°ω°༽")
  expect(await waitForFrame(view, frame => frame.includes("༼^ω^༽"))).toContain("༼^ω^༽")
})

test("a newer emote replaces the one showing", async () => {
  view = renderForTest(<Monster />)
  emote("problem", 5000)
  await waitForFrame(view, frame => frame.includes("༼°ω°༽"))
  emote("checking", 5000)
  expect(await waitForFrame(view, frame => frame.includes("༼•ω•༽"))).toContain("༼•ω•༽")
})

test("hooks pull faces: a question asks, a tool call checks, an error is a problem", async () => {
  view = renderForTest(<Monster />)
  for (const [hook, face] of [
    ["question", "༼☉ω⊙༽"],
    ["tool_call", "༼•ω•༽"],
    ["message", "༼^ω^༽"],
    ["error", "༼°ω°༽"]
  ] as const) {
    fireHook(hook)
    expect(await waitForFrame(view, frame => frame.includes(face))).toContain(face)
  }
})
