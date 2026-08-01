// supports-hyperlinks (used by marked-terminal for clickable links) only
// recognizes a narrow allowlist of terminals via TERM_PROGRAM/VTE_VERSION;
// it misses terminals like Alacritty unless TERM is literally "alacritty",
// so links silently render as "text (url)" instead of OSC 8 hyperlinks.
// Force it on: it must be set before marked-terminal's first import
// anywhere, since supports-hyperlinks reads process.env once at module load.
if (!process.env.FORCE_HYPERLINK) process.env.FORCE_HYPERLINK = "1"

import { resolve } from "node:path"
import { color } from "bun"
import { render } from "ink"
import { InkPictureProvider } from "ink-picture"
import { config, create, getConfigPath, isExists, readConfigLoose, setConfigDirOverride, validate } from "./lib/config"
import { detectLanguage, setLanguage, t } from "./lib/i18n"
import { log } from "./lib/logger"
import { loadModels } from "./lib/models"
import { loadPersonas } from "./lib/personas"
import { readServicesLoose } from "./lib/services"

// The TUI owns the terminal: unless the user asked for a level explicitly,
// silence pino's info chatter (stt/tts progress lines go to stderr and would
// scribble over the Ink UI).
if (!process.env.LOG_LEVEL) log.level = "warn"

log.trace("Startup")

// --config-dir is pre-scanned from argv instead of read from meow: it must
// take effect before the language-detecting config read just below, and the
// args import has to come after that read (meow builds --help at module
// load). The flag is still declared in lib/args.ts so --help documents it.
{
  const argv = process.argv.slice(2)
  const i = argv.findIndex(a => a === "--config-dir" || a.startsWith("--config-dir="))
  let value: string | undefined
  if (i === -1) {
    value = undefined
  } else if (argv[i].startsWith("--config-dir=")) {
    value = argv[i].slice("--config-dir=".length)
  } else {
    value = argv[i + 1]
  }
  if (value) setConfigDirOverride(resolve(value))
}

// i18n first: meow builds --help at module load, so the language must be set
// before the args import. Config wins; without one (or on first run) the
// system locale decides.
const loose = await readConfigLoose()
const lang = loose.settings?.language
setLanguage(lang === "hu" || lang === "en" ? lang : detectLanguage())

// Meow runs at module load (exits on --help/--version/--config). Before the
// config guard on purpose, so those flags work even with a missing or
// invalid config.
const { cli } = await import("./lib/args")

// Memory subcommand: before the config guard on purpose — browsing and
// managing memory must work even with a missing or invalid LLM config.
if (cli.input[0] === "memory") {
  const { runMemoryCli } = await import("./lib/memory-cli")
  const { code, text } = await runMemoryCli(cli.input.slice(1))
  console.log(text)
  process.exit(code)
}

// Session subcommand: same deal — browsing past sessions must work even
// with a missing or invalid LLM config.
if (cli.input[0] === "session") {
  const { runSessionCli } = await import("./lib/session-cli")
  const { code, text } = await runSessionCli(cli.input.slice(1))
  console.log(text)
  process.exit(code)
}

// Web subcommand: same deal — the config/memory browser is most useful
// exactly when the setup is broken, so it must run without a valid config.
if (cli.input[0] === "web") {
  const { runWebCli } = await import("./lib/web-cli")
  process.exit(await runWebCli({ port: cli.flags.port }))
}

// Config subcommand: same deal — `kaja config fetch` is how a fresh install
// (or a broken one) gets real config.json/models.toml/services.toml files in
// the first place, so it must work without any of them already in place.
// --api-url substitutes for services.toml's [api] baseUrl until fetch
// persists it.
if (cli.input[0] === "config") {
  const { runConfigCli } = await import("./lib/config-cli")
  const looseServices = await readServicesLoose()
  const { code, text } = await runConfigCli(cli.input.slice(1), looseServices, { apiUrl: cli.flags.apiUrl })
  console.log(text)
  process.exit(code)
}

// First run: write the template so there's a concrete file to edit, rather
// than starting from nothing. Missing or invalid config (including a
// freshly written template, which needs real models.toml entries to
// resolve) always exits pointing at the path to edit — there's no wizard to
// fall through to.
if (!(await isExists())) await create()
if (!(await validate(true))) {
  console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
  process.exit(1)
}

// Imported after the config guard: lib/openai.ts reads the config at module
// load (transitively, via lib/agents.ts), so a static import would crash
// before the first-run flow above.
const { default: App } = await import("./components/layout/app")
const { getDefaultTools } = await import("./tools")
const { listSessions, loadLatestSessionRow, loadPromptHistory, loadSessionRow } = await import("./lib/session-store")
const { loadMemory, resolveMemoryDbPath } = await import("./lib/memory-store")
const { chatModelId } = await import("./lib/openai")

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
if (cli.input[0] === "telegram") {
  const { runTelegramCli } = await import("./lib/telegram-cli")
  const { services } = await import("./lib/services")
  const code = await runTelegramCli({
    services: await services(),
    tools,
    personas,
    models
  })
  await shutdown()
  process.exit(code)
}

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
