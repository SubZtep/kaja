import { afterAll, expect, test } from "bun:test"
import { Box } from "ink"
import { StartupPanel } from "../../components/startup-panel"
import type { Tool } from "../../lib/agent/agents"
import { t as translate } from "../../lib/i18n"
import { renderForTest } from "../test-utils"

function fakeTool(name: string): Tool<any> {
  return {
    definition: { type: "function", function: { name, description: "", parameters: {} } },
    execute: async () => ""
  }
}

// A tiny stand-in OpenAI-compatible server, same shape as tests/lib/model-check.test.ts's — StartupPanel calls the real checkModelAvailability, so no mock.module (it replaces modules process-wide, not just for this file, and would leak into other test files sharing the same bun test process).
let flakyAttempts = 0
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/chat/completions") {
      const body = (await req.json()) as { model: string }
      if (body.model === "up-model" || body.model === "tts-model") {
        return Response.json({
          id: "x",
          choices: [{ message: { role: "assistant", content: "hi" } }]
        })
      }
      if (body.model === "flaky-model") {
        flakyAttempts += 1
        if (flakyAttempts >= 2) {
          return Response.json({
            id: "x",
            choices: [{ message: { role: "assistant", content: "hi" } }]
          })
        }
      }
      return new Response("model not found", { status: 404 })
    }
    if (url.pathname === "/models") {
      return Response.json({ data: [{ id: "tts-model" }] })
    }
    return new Response("not found", { status: 404 })
  }
})
const baseUrl = `http://localhost:${server.port}`

afterAll(() => {
  server.stop()
})

test("shows persona, grouped models with availability, and stats", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[
          { id: "up-model", model: "up-model", task: "chat", baseUrl, provider: "default" },
          { id: "down-model", model: "down-model", task: "chat", baseUrl, provider: "default" },
          { id: "tts-model", model: "tts-model", task: "tts", baseUrl, provider: "default" }
        ]}
        activeModelId="up-model"
        cwd="/home/kaja/project"
        sessionCount={3}
        memoryNoteCount={5}
        tools={[fakeTool("read_file"), fakeTool("list_files")]}
      />
    </Box>
  )
  await t.tick()
  await t.tick()

  const frame = t.lastFrame()
  // Only the active chat model is shown (persona-pinned alternates in models.toml are hidden). Non-chat tasks (tts here) still show every configured entry and are always checked.
  expect(frame).toContain("✓ up-model")
  expect(frame).not.toContain("down-model")
  expect(frame).toContain("✓ tts-model")
  expect(frame).toContain("/home/kaja/project")
  expect(frame).toContain("3")
  expect(frame).toContain("5")
  expect(frame).toContain("read_file")
  expect(frame).toContain("list_files")

  t.unmount()
  await t.waitUntilExit()
})

test("retries a failed check and settles on available once it succeeds", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={10}>
      <StartupPanel
        models={[
          {
            id: "flaky-model",
            model: "flaky-model",
            task: "chat",
            baseUrl,
            provider: "default"
          }
        ]}
        activeModelId="flaky-model"
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[]}
      />
    </Box>
  )
  await t.tick()

  // First attempt fails; stays pending (not "down") while a retry is queued.
  expect(t.lastFrame()).toContain("○ flaky-model")
  // The retry (RETRY_DELAY_MS later) succeeds.
  await Bun.sleep(4500)
  expect(t.lastFrame()).toContain("✓ flaky-model")

  t.unmount()
  await t.waitUntilExit()
})

test("shows a placeholder when no models are configured", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={10}>
      <StartupPanel models={[]} cwd="/home/kaja/project" sessionCount={0} memoryNoteCount={0} tools={[]} />
    </Box>
  )
  await t.tick()

  expect(t.lastFrame()).toContain("No models configured")

  t.unmount()
  await t.waitUntilExit()
})

test("groups models in a fixed task order regardless of input order", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[
          { id: "tts-model", model: "tts-model", task: "tts", baseUrl, provider: "default" },
          { id: "embed-model", model: "embed-model", task: "embedding", baseUrl, provider: "default" },
          { id: "chat-model", model: "chat-model", task: "chat", baseUrl, provider: "default" }
        ]}
        activeModelId="chat-model"
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[]}
      />
    </Box>
  )
  await t.tick()

  const frame = t.lastFrame() ?? ""
  const chatIndex = frame.indexOf("chat-model")
  const embedIndex = frame.indexOf("embed-model")
  const ttsIndex = frame.indexOf("tts-model")
  expect(chatIndex).toBeGreaterThanOrEqual(0)
  expect(embedIndex).toBeGreaterThan(chatIndex)
  expect(ttsIndex).toBeGreaterThan(embedIndex)

  t.unmount()
  await t.waitUntilExit()
})

test("lists connected MCP servers with their tool counts", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[]}
        mcpServers={[
          { id: "playwright", toolCount: 5 },
          { id: "chrome-devtools", toolCount: 12 }
        ]}
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[]}
      />
    </Box>
  )
  await t.tick()

  const frame = t.lastFrame()
  expect(frame).toContain("MCP servers")
  expect(frame).toContain("playwright")
  expect(frame).toContain("(5 tools)")
  expect(frame).toContain("chrome-devtools")
  expect(frame).toContain("(12 tools)")

  t.unmount()
  await t.waitUntilExit()
})

test("marks a failed MCP server connection instead of showing a tool count", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[]}
        mcpServers={[
          { id: "playwright", toolCount: 5 },
          { id: "broken-server", toolCount: 0, failed: true }
        ]}
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[]}
      />
    </Box>
  )
  await t.tick()

  const frame = t.lastFrame()
  expect(frame).toContain("✓ playwright")
  expect(frame).toContain("(5 tools)")
  expect(frame).toContain("✗ broken-server")
  expect(frame).toContain("(failed to connect)")

  t.unmount()
  await t.waitUntilExit()
})

test("omits the MCP servers section when none are connected", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={10}>
      <StartupPanel models={[]} cwd="/home/kaja/project" sessionCount={0} memoryNoteCount={0} tools={[]} />
    </Box>
  )
  await t.tick()

  expect(t.lastFrame()).not.toContain("MCP servers")

  t.unmount()
  await t.waitUntilExit()
})

test("lists available tool names in the right column", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[]}
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[fakeTool("read_file"), fakeTool("run_command")]}
      />
    </Box>
  )
  await t.tick()

  const frame = t.lastFrame()
  expect(frame).toContain(translate("startup.tools"))
  expect(frame).toContain("read_file")
  expect(frame).toContain("run_command")

  t.unmount()
  await t.waitUntilExit()
})

test("stacks the two columns vertically when the terminal is narrower than the breakpoint", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={40} height={20}>
      <StartupPanel
        models={[]}
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[fakeTool("read_file")]}
      />
    </Box>,
    { columns: 40 }
  )
  await t.tick()

  const lines = (t.lastFrame() ?? "").split("\n")
  const statsLine = lines.findIndex(line => line.includes("Sessions"))
  const toolsLine = lines.findIndex(line => line.trim() === translate("startup.tools"))
  expect(statsLine).toBeGreaterThanOrEqual(0)
  expect(toolsLine).toBeGreaterThan(statsLine)

  t.unmount()
  await t.waitUntilExit()
})

test("keeps the two columns side by side when the terminal is wide enough", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[]}
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[fakeTool("read_file")]}
      />
    </Box>,
    { columns: 80 }
  )
  await t.tick()

  const lines = (t.lastFrame() ?? "").split("\n")
  const cwdLine = lines.findIndex(line => line.includes("/home/kaja/project"))
  const toolsLine = lines.findIndex(line => line.includes(translate("startup.tools")) && !line.includes("Sessions"))
  expect(cwdLine).toBeGreaterThanOrEqual(0)
  expect(toolsLine).toBe(cwdLine)

  t.unmount()
  await t.waitUntilExit()
})

test("omits the tools column when there are no tools", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={10}>
      <StartupPanel models={[]} cwd="/home/kaja/project" sessionCount={0} memoryNoteCount={0} tools={[]} />
    </Box>
  )
  await t.tick()

  const lines = (t.lastFrame() ?? "").split("\n")
  expect(lines).not.toContain(translate("startup.tools"))

  t.unmount()
  await t.waitUntilExit()
})

test("shows only the active chat model, hiding persona-pinned alternates", async () => {
  const t = renderForTest(
    <Box flexDirection="column" width={80} height={20}>
      <StartupPanel
        models={[
          { id: "chat", model: "minimax-m3", task: "chat", baseUrl, provider: "default" },
          { id: "reasoning-chat", model: "deepseek-v4-pro", task: "chat", baseUrl, provider: "default" },
          { id: "big-chat", model: "kimi-k2p6", task: "chat", baseUrl, provider: "default" }
        ]}
        activeModelId="minimax-m3"
        cwd="/home/kaja/project"
        sessionCount={0}
        memoryNoteCount={0}
        tools={[]}
      />
    </Box>
  )
  await t.tick()

  const frame = t.lastFrame() ?? ""
  expect(frame).toContain("minimax-m3")
  expect(frame).not.toContain("deepseek-v4-pro")
  expect(frame).not.toContain("kimi-k2p6")

  t.unmount()
  await t.waitUntilExit()
})
