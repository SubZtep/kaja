import { color } from "bun"
import { render } from "ink"
import { InkPictureProvider } from "ink-picture"
import { applyConfigDirOverride, detectAndSetLanguage } from "./lib/cli/bootstrap"
import { dispatchEarlySubcommands, dispatchTelegram } from "./lib/cli/dispatch"
import { runFirstRunIfNeeded } from "./lib/cli/first-run"
import { config, getConfigPath, validate } from "./lib/config/config"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { loadModels } from "./lib/models/models"
import { loadPersonas } from "./lib/personas/personas"

log.trace("Startup")

// --config-dir must take effect before the language-detecting config read
// just below, and the args import has to come after that read (meow builds
// --help at module load).
applyConfigDirOverride(process.argv.slice(2))
await detectAndSetLanguage()

// Meow runs at module load (exits on --help/--version/--config). Before the
// config guard on purpose, so those flags work even with a missing or
// invalid config.
const { cli } = await import("./lib/cli/args")

await dispatchEarlySubcommands(cli)

await runFirstRunIfNeeded()

if (!(await validate(true))) {
  console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
  process.exit(1)
}

// Imported after the config guard: lib/openai.ts reads the config at module
// load (transitively, via lib/agents.ts), so a static import would crash
// before the first-run flow above.
const { default: App } = await import("./components/layout/app")
const { getDefaultTools } = await import("./tools")
const { listSessions, loadLatestSessionRow, loadPromptHistory, loadSessionRow } = await import("./lib/session/store")
const { loadMemory, resolveMemoryDbPath } = await import("./lib/memory/store")
const { chatModelId } = await import("./lib/models/openai")

// --continue resumes the most recent session, --session <id> a specific
// one; either way the restored conversation is handed to App as a prop.
let initialSession: import("./schemas/session").PersistedSession | undefined
if (cli.flags.continue) {
  initialSession = await loadLatestSessionRow()
  if (!initialSession) {
    console.log(t("session.none"))
    process.exit(1)
  }
} else if (cli.flags.session) {
  const sessionId = Number.parseInt(cli.flags.session, 10)
  initialSession = Number.isFinite(sessionId) ? await loadSessionRow(sessionId) : undefined
  if (!initialSession) {
    console.log(t("session.notFound", { id: cli.flags.session }))
    process.exit(1)
  }
}
const promptHistory = await loadPromptHistory()

const currentConfig = await config()

const { settings } = currentConfig
const models = await loadModels()
const personas = await loadPersonas(models)
const { tools, mcpServers, closeTools } = await getDefaultTools()
const sessionCount = (await listSessions()).length
const memoryNoteCount = Object.keys(await loadMemory()).length
const brainPath = await resolveMemoryDbPath()
// Closes any long-lived tool connection (e.g. the Playwright MCP subprocess)
// so it isn't left orphaned; guarded so SIGINT and the normal exit path
// below can't both try to close it.
let closed = false
const shutdown = async () => {
  if (closed) return
  closed = true
  await closeTools()
}
process.on("SIGINT", async () => {
  await shutdown()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await shutdown()
  process.exit(0)
})

// Telegram subcommand: after the config guard (it needs a fully-validated
// config, tools, personas, and models to run a real agent — unlike memory/
// session, which must work even without one) but before Ink ever renders,
// since this path never touches the terminal UI at all. Runs until killed
// (Ctrl+C/SIGTERM), reusing the shutdown()/closeTools() cleanup already
// wired above.
await dispatchTelegram(cli, { tools, personas, models, shutdown })

// Alternate screen: full-viewport app (header / chat / input). Restores the
// primary buffer on exit; no terminal scrollback while running.
// Kitty keyboard (auto): so Shift+Enter is distinct from Enter — plain TTYs
// send the same `\r` for both and cannot do Shift+Enter newlines otherwise.
const { waitUntilExit } = render(
  <InkPictureProvider>
    <App
      initialSettings={settings}
      models={models}
      personas={personas}
      openaiApiModel={chatModelId}
      tools={tools}
      mcpServers={mcpServers}
      initialSession={initialSession}
      promptHistory={promptHistory}
      sessionCount={sessionCount}
      memoryNoteCount={memoryNoteCount}
      brainPath={brainPath}
    />
  </InkPictureProvider>,
  {
    alternateScreen: true,
    kittyKeyboard: {
      mode: "auto",
      flags: ["disambiguateEscapeCodes"]
    }
  }
)
await waitUntilExit()
await shutdown()

console.log(t("cli.bye"))
process.exit(0)
