/**
 * Runs after the config guard (needs a fully-validated config, tools,
 * personas, and models to run a real agent — unlike memory/session/web/config,
 * which must work even without one) but before Ink ever renders, since this
 * path never touches the terminal UI at all.
 */
export async function runTelegramSubcommand() {
  const { getDefaultTools } = await import("../tools")
  const { loadModels } = await import("../lib/models/models")
  const { loadPersonas } = await import("../lib/personas/personas")
  const { runTelegramCli } = await import("../lib/telegram/cli")
  const { services } = await import("../lib/config/services")

  const models = await loadModels()
  const personas = await loadPersonas(models)
  const { tools, closeTools } = await getDefaultTools()

  // finally, not just a trailing call: an error thrown out of runTelegramCli must not skip closing MCP subprocess connections
  let code: number
  try {
    code = await runTelegramCli({
      services: await services(),
      tools,
      personas,
      models
    })
  } finally {
    await closeTools()
  }
  process.exit(code)
}
