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

// --config must take effect before the language-detecting config read below; args import must come after (meow builds --help at module load)
applyConfigDirOverride(process.argv.slice(2))
await detectAndSetLanguage()

// Before the config guard on purpose, so --help/--version/--config work even with a missing or invalid config
const { cli } = await import("./lib/cli/args")

await dispatchEarlySubcommands(cli)

await runFirstRunIfNeeded()

if (!(await validate(true))) {
  console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
  process.exit(1)
}

// Imported after the config guard: lib/openai.ts reads config at module load (via lib/agents.ts), so a static import would crash before first-run above
const { default: App } = await import("./components/layout/app")
const { getDefaultTools } = await import("./tools")
const { listSessions, loadLatestSessionRow, loadPromptHistory, loadSessionRow } = await import("./lib/session/store")
const { loadMemory } = await import("./lib/memory/store")
const { chatModelId, isFreeChat } = await import("./lib/models/openai")

// --continue resumes the most recent session, --session <id> a specific one; either way it's handed to App as a prop
let initialSession: import("@kaja/schema/store").PersistedSession | undefined
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

const { preferences } = currentConfig
const models = await loadModels()
const personas = await loadPersonas(models)
const { tools, mcpServers, closeTools } = await getDefaultTools()
const sessionCount = (await listSessions()).length
const memoryNoteCount = Object.keys(await loadMemory()).length
// Closes long-lived tool connections (e.g. Playwright MCP subprocess); guarded so SIGINT and normal exit can't both close it
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

// After the config guard (needs a fully-validated config/tools/personas/models) but before Ink renders, since this path never touches the terminal UI
await dispatchTelegram(cli, { tools, personas, models, shutdown })

// Alternate screen: full-viewport app, restores primary buffer on exit, no scrollback while running
// Kitty keyboard (auto): so Shift+Enter is distinct from Enter — plain TTYs send the same `\r` for both
const { waitUntilExit } = render(
  <InkPictureProvider>
    <App
      initialPreferences={preferences}
      models={models}
      personas={personas}
      openaiApiModel={chatModelId}
      freeChat={isFreeChat}
      tools={tools}
      mcpServers={mcpServers}
      initialSession={initialSession}
      promptHistory={promptHistory}
      sessionCount={sessionCount}
      memoryNoteCount={memoryNoteCount}
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
