import { expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-hooks`

const { getHooksPath, loadHooks, runHook } = await import("../../../lib/config/hooks")
const { getConfigDir } = await import("../../../lib/config/config")
const { write, file } = await import("bun")

async function reset() {
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

test("no hooks.toml means no hooks, and nothing is created", async () => {
  await reset()
  expect(loadHooks()).toEqual({})
  expect(await file(getHooksPath()).exists()).toBe(false)
})

test("the commands load", async () => {
  await reset()
  await write(getHooksPath(), 'message = "say-it"\nquestion = "notify-it"\n')
  expect(loadHooks()).toEqual({ message: "say-it", question: "notify-it" })
})

test("a broken or wrongly typed file means no hooks", async () => {
  await reset()
  await write(getHooksPath(), "message = not toml")
  expect(loadHooks()).toEqual({})
  await write(getHooksPath(), "message = 3\n")
  expect(loadHooks()).toEqual({})
})

test("a hook gets the text in the environment and on stdin, and runs without being awaited", async () => {
  await reset()
  const env = join(getConfigDir(), "env.txt")
  const stdin = join(getConfigDir(), "stdin.txt")
  runHook("question", `printf '%s %s' "$KAJA_HOOK" "$KAJA_TEXT" > '${env}'; cat > '${stdin}'`, "Shall I go on?")
  expect(await waitForText(env)).toBe("question Shall I go on?")
  expect(await waitForText(stdin)).toBe("Shall I go on?")
})

test("a command that fails to run is only logged", () => {
  expect(() => runHook("message", "exit 3", "hi")).not.toThrow()
})
