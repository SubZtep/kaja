/**
 * Runs after the config guard (needs a fully-validated config, tools,
 * personas, and models to run a real agent — unlike memory/session/web/config,
 * which must work even without one) but before Ink ever renders, since this
 * path never touches the terminal UI at all. --headless's first consumer.
 */
export async function runTelegramSubcommand() {
  const { bootstrapLocalAgentDeps, requireConfiguredProvider } = await import("../lib/cli/headless")
  const { runTelegramCli } = await import("../lib/telegram/cli")
  const { services } = await import("../lib/config/services")

  await requireConfiguredProvider()

  const { models, personas, tools, closeTools } = await bootstrapLocalAgentDeps()

  const code = await runTelegramCli({
    services: await services(),
    tools,
    personas,
    models,
    closeTools
  })
  process.exit(code)
}
