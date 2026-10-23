import { expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-hooks`

const { fireHook, getHooksPath, loadHooks, resetHooks, runHook } = await import("../../../lib/config/hooks")
const { getConfigDir } = await import("../../../lib/config/config")
const { getLanguage } = await import("../../../lib/i18n")
const { write, file } = await import("bun")

async function reset() {
  resetHooks()
  await rm(getConfigDir(), { recursive: true, force: true })
  await mkdir(getConfigDir(), { recursive: true })
}

/** Polls for a file a background hook writes; a loaded machine gets a generous deadline. */
async function waitForText(path: string) {
  for (let i = 0; i < 300; i++) {
    const f = file(path)
    if ((await f.exists()) && (await f.text()) !== "") return f.text()
    await Bun.sleep(50)
  }
  throw new Error(`${path} never appeared`)
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntilDead(pid: number) {
  for (let i = 0; i < 300 && alive(pid); i++) await Bun.sleep(50)
  return !alive(pid)
}

test("no hooks.toml means no hooks, and nothing is created", async () => {
  await reset()
  expect(loadHooks()).toEqual({})
  expect(await file(getHooksPath()).exists()).toBe(false)
})

test("several commands per event load, with their cancel setting", async () => {
  await reset()
  await write(
    getHooksPath(),
    '[[message]]\nrun = "say-it"\ncancel = "speech"\n\n[[message]]\nrun = "ding"\n\n[[question]]\nrun = "notify-it"\ncancel = true\n'
  )
  expect(loadHooks()).toEqual({
    message: [{ run: "say-it", cancel: "speech" }, { run: "ding" }],
    question: [{ run: "notify-it", cancel: true }]
  })
})

test("a broken, old-style or wrongly typed file means no hooks", async () => {
  await reset()
  await write(getHooksPath(), "message = not toml")
  expect(loadHooks()).toEqual({})
  await write(getHooksPath(), 'message = "espeak-ng --stdin"\n')
  expect(loadHooks()).toEqual({})
  await write(getHooksPath(), "[[message]]\nrun = 3\n")
  expect(loadHooks()).toEqual({})
})

test("a hook gets the text, title, sounds folder and locale in the environment, the text on stdin, and runs without being awaited", async () => {
  await reset()
  const env = join(getConfigDir(), "env.txt")
  const stdin = join(getConfigDir(), "stdin.txt")
  runHook(
    "question",
    {
      run: `printf '%s|%s|%s|%s|%s' "$KAJA_HOOK" "$KAJA_TEXT" "$KAJA_TITLE" "$KAJA_SOUNDS" "$KAJA_LOCALE" > '${env}'; cat > '${stdin}'`
    },
    { text: "Shall I go on?", title: "Kaja asks" }
  )
  const [hook, text, title, sounds, locale] = (await waitForText(env)).split("|")
  expect([hook, text, title]).toEqual(["question", "Shall I go on?", "Kaja asks"])
  expect(sounds).toEndWith("sounds")
  expect(locale).toBe(getLanguage())
  expect(await waitForText(stdin)).toBe("Shall I go on?")
})

test("firing an event starts every command listed for it, and none for an event without any", async () => {
  await reset()
  const one = join(getConfigDir(), "one.txt")
  const two = join(getConfigDir(), "two.txt")
  const none = join(getConfigDir(), "none.txt")
  await write(
    getHooksPath(),
    `[[message]]\nrun = "printf one > '${one}'"\n\n[[message]]\nrun = "printf two > '${two}'"\n\n[[error]]\nrun = "printf no > '${none}'"\n`
  )
  fireHook("message")
  expect(await waitForText(one)).toBe("one")
  expect(await waitForText(two)).toBe("two")
  expect(await file(none).exists()).toBe(false)
})

test("a command with cancel stops the earlier run of its name, and leaves other names running", async () => {
  await reset()
  const pidOf = async (name: string) => Number((await waitForText(join(getConfigDir(), name))).trim())
  const sleeper = (name: string) => `echo $$ > '${join(getConfigDir(), name)}'; sleep 60`

  runHook("message", { run: sleeper("a"), cancel: "speech" })
  const first = await pidOf("a")
  runHook("question", { run: sleeper("b"), cancel: "speech" })
  const second = await pidOf("b")
  expect(await waitUntilDead(first)).toBe(true)
  expect(alive(second)).toBe(true)

  runHook("message", { run: sleeper("c"), cancel: "other" })
  const third = await pidOf("c")
  expect(alive(second)).toBe(true)

  // The shell leads its own process group, so this takes its sleep along
  for (const pid of [second, third]) process.kill(-pid, "SIGTERM")
  expect(await waitUntilDead(second)).toBe(true)
})

test("cancel = true stops an earlier run of the same command only", async () => {
  await reset()
  const marker = join(getConfigDir(), "same")
  const run = `echo $$ >> '${marker}'; sleep 60`
  runHook("message", { run, cancel: true })
  await waitForText(marker)
  const first = Number((await file(marker).text()).trim())
  runHook("message", { run, cancel: true })
  expect(await waitUntilDead(first)).toBe(true)

  let pids = (await file(marker).text()).trim().split("\n")
  for (let i = 0; i < 300 && pids.length < 2; i++) {
    await Bun.sleep(50)
    pids = (await file(marker).text()).trim().split("\n")
  }
  expect(pids).toHaveLength(2)
  process.kill(-Number(pids[1]), "SIGTERM")
})

test("a command that fails to run is only logged", () => {
  expect(() => runHook("message", { run: "exit 3" }, { text: "hi" })).not.toThrow()
})
