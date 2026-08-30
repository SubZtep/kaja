import type { args as Cli } from "../lib/cli/args"

/**
 * The default case (no recognized subcommand): resolves the
 * session/config/tools/personas, then renders the Ink TUI. Kept out of
 * cli.tsx so the entry point stays a thin arg-parser.
 */
export async function runSubcommand(cli: typeof Cli) {
  const { config } = await import("../lib/config/config")
  const { t } = await import("../lib/i18n")
  const { bootstrapLocalAgentDeps, installShutdownHandlers, requireConfiguredProvider } = await import(
    "../lib/cli/headless"
  )

  // Imported after the config guard (already validated by the time cli.tsx calls this): lib/openai.ts reads config at module load (via lib/agents.ts), so a static import would crash before first-run
  const { default: App } = await import("../components/layout/app")
  const { listSessions, loadLatestSessionRow, loadPromptHistory, loadSessionRow } = await import("../lib/session/store")
  const { loadMemory } = await import("../lib/memory/store")
  const { chatModelId, isFreeChat } = await import("../lib/models/openai")

  // --local is the self-configured-provider path: no silent fallback to
  // Kaja's hosted free tier. Run `kaja` (no flags) for hosted chat instead.
  await requireConfiguredProvider()

  // --continue resumes the most recent session, --session <id> a specific one; either way it's handed to App as a prop
  let initialSession: import("@kaja/schema/store").PersistedSession | undefined
  if (cli.flags.continue) {
    initialSession = await loadLatestSessionRow()
    if (!initialSession) {
      console.log(t("session.none"))
      process.exit(1)
    }
  } else if (cli.flags.session) {
    initialSession = await loadSessionRow(cli.flags.session)
    if (!initialSession) {
      console.log(t("session.notFound", { id: cli.flags.session }))
      process.exit(1)
    }
  }
  const promptHistory = await loadPromptHistory()

  const currentConfig = await config()

  const { preferences } = currentConfig
  const { models, personas, tools, mcpServers, closeTools } = await bootstrapLocalAgentDeps()
  const sessionCount = (await listSessions()).length
  const memoryNoteCount = Object.keys(await loadMemory()).length

  // Closes long-lived tool connections (e.g. Playwright MCP subprocess) on SIGINT/normal exit.
  const shutdown = installShutdownHandlers(closeTools)

  // Deferred until here: nothing before this point touches the terminal UI
  const { render } = await import("ink")

  // Alternate screen: full-viewport app, restores primary buffer on exit, no scrollback while running
  // Kitty keyboard (auto): so Shift+Enter is distinct from Enter — plain TTYs send the same `\r` for both
  const { waitUntilExit } = render(
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
    />,
    {
      alternateScreen: true,
      kittyKeyboard: {
        mode: "auto",
        flags: ["disambiguateEscapeCodes"]
      }
    }
  )
  // finally, not just a trailing call: an error thrown out of waitUntilExit (e.g. a render crash) must not skip closing MCP subprocess connections
  try {
    await waitUntilExit()
  } finally {
    await shutdown()
  }

  console.log(t("cli.bye"))
  process.exit(0)
}
