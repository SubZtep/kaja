import { expect, test } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Text } from "ink"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-use-hooks`

const { useHooks } = await import("../../src/hooks/use-hooks")
const { getConfigDir } = await import("../../src/lib/config/config")
const { getHooksPath, resetHooks } = await import("../../src/lib/config/hooks")
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
  resetHooks()
  await rm(getConfigDir(), { recursive: true, force: true })
  await mkdir(getConfigDir(), { recursive: true })
  const log = join(getConfigDir(), "log.txt")
  await write(
    getHooksPath(),
    `[[message]]\nrun = "echo \\"m:$KAJA_TEXT\\" >> '${log}'"\n\n[[question]]\nrun = "echo \\"q:$KAJA_TEXT\\" >> '${log}'"\n`
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

test("the other events fire their hooks, with a title where there is one", async () => {
  resetHooks()
  await rm(getConfigDir(), { recursive: true, force: true })
  await mkdir(getConfigDir(), { recursive: true })
  const log = join(getConfigDir(), "events.txt")
  const hook = (name: string) => `[[${name}]]\nrun = "echo \\"$KAJA_HOOK|$KAJA_TEXT|$KAJA_TITLE\\" >> '${log}'"\n`
  await write(
    getHooksPath(),
    ["confirm", "reasoning", "tool_call", "notice", "persona_switch", "error"].map(hook).join("\n")
  )

  const t = renderForTest(<Harness events={[]} />)
  await t.tick()
  t.rerender(
    <Harness
      events={
        [
          { type: "confirm_command", command: "rm x", description: "Delete x" },
          { type: "reasoning", text: "hmm" },
          { type: "tool_call", id: "1", name: "web_search", arguments: "{}" },
          { type: "compacted", beforeTokens: 10, afterTokens: 5, dropped: false },
          { type: "persona_switch", personaId: "b", label: "Persona B" },
          { type: "error", text: "boom", category: "unknown" }
        ] as Events
      }
    />
  )

  const lines = await waitForLines(log, 6)
  const byHook = Object.fromEntries(lines.map(line => [line.split("|")[0], line]))
  expect(Object.keys(byHook).sort()).toEqual(["confirm", "error", "notice", "persona_switch", "reasoning", "tool_call"])
  expect(byHook.confirm).toStartWith("confirm|Delete x|")
  expect(byHook.persona_switch).toContain("Persona B")
  expect(byHook.error).toStartWith("error|boom|")
  expect(byHook.tool_call).toBe("tool_call||Kaja")

  t.unmount()
  await t.waitUntilExit()
})
