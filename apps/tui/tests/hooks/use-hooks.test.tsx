import { expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Text } from "ink"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-use-hooks`

const { useHooks } = await import("../../hooks/use-hooks")
const { getConfigDir } = await import("../../lib/config/config")
const { getHooksPath } = await import("../../lib/config/hooks")
const { renderForTest } = await import("../test-utils")
const { write, file } = await import("bun")

type Events = Parameters<typeof useHooks>[0]

function Harness({ events }: { events: Events }) {
  useHooks(events)
  return <Text>{events.length}</Text>
}

async function waitForLines(path: string, count: number) {
  for (let i = 0; i < 300; i++) {
    const f = file(path)
    if (await f.exists()) {
      const lines = (await f.text()).split("\n").filter(Boolean)
      if (lines.length >= count) return lines
    }
    await Bun.sleep(50)
  }
  throw new Error(`${path} never had ${count} lines`)
}

test("replies and asked questions fire their hooks (a reply ending in a question mark is a reply) as plain text, and what was there on mount does not", async () => {
  await rm(getConfigDir(), { recursive: true, force: true })
  await mkdir(getConfigDir(), { recursive: true })
  const log = join(getConfigDir(), "log.txt")
  await write(
    getHooksPath(),
    `message = "echo \\"m:$KAJA_TEXT\\" >> '${log}'"\nquestion = "echo \\"q:$KAJA_TEXT\\" >> '${log}'"\n`
  )

  const old: Events = [{ type: "message", content: "from before" }]
  const t = renderForTest(<Harness events={old} />)
  await t.tick()

  const next: Events = [
    ...old,
    { type: "user", text: "ignored" },
    { type: "message", content: "**Hello** there" },
    { type: "ask_user", question: "Which one?", fromTool: true },
    { type: "ask_user", question: "Anything else?" },
    { type: "final", content: "Done" }
  ]
  t.rerender(<Harness events={next} />)

  const lines = await waitForLines(log, 4)
  expect([...lines].sort()).toEqual(["m:Anything else?", "m:Done", "m:Hello there", "q:Which one?"])

  t.unmount()
  await t.waitUntilExit()
})
