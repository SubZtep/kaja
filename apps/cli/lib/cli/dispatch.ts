import { readServicesLoose } from "../config/services"
import type { cli as Cli } from "./args"

/**
 * memory/session/web/config: browsing/fixing config must work even with a
 * missing or invalid LLM config, so these run before the config guard.
 */
export async function dispatchEarlySubcommands(cli: typeof Cli) {
  if (cli.input[0] === "memory") {
    const { runMemoryCli } = await import("../memory/cli")
    const { code, text } = await runMemoryCli(cli.input.slice(1))
    console.log(text)
    process.exit(code)
  }

  if (cli.input[0] === "session") {
    const { runSessionCli } = await import("../session/cli")
    const { code, text } = await runSessionCli(cli.input.slice(1))
    console.log(text)
    process.exit(code)
  }

  if (cli.input[0] === "web") {
    const { runWebCli } = await import("../web/cli")
    process.exit(await runWebCli({ port: cli.flags.port }))
  }

  // `kaja config fetch` is how a fresh install (or a broken one) gets real
  // settings.json/models.toml/services.toml files in the first place, so it
  // must work without any of them already in place. --api-url substitutes
  // for services.toml's [api] baseUrl until fetch persists it.
  if (cli.input[0] === "config") {
    const { runConfigCli } = await import("../config/cli")
    const looseServices = await readServicesLoose()
    const { code, text } = await runConfigCli(cli.input.slice(1), looseServices, { apiUrl: cli.flags.apiUrl })
    console.log(text)
    process.exit(code)
  }
}

/**
 * Runs after the config guard (needs a fully-validated config, tools,
 * personas, and models to run a real agent — unlike memory/session, which
 * must work even without one) but before Ink ever renders, since this path
 * never touches the terminal UI at all.
 */
export async function dispatchTelegram(
  cli: typeof Cli,
  ctx: {
    tools: Awaited<ReturnType<typeof import("../../tools").getDefaultTools>>["tools"]
    personas: Awaited<ReturnType<typeof import("../personas/personas").loadPersonas>>
    models: Awaited<ReturnType<typeof import("../models/models").loadModels>>
    shutdown: () => Promise<void>
  }
) {
  if (cli.input[0] !== "telegram") return

  const { runTelegramCli } = await import("../telegram/cli")
  const { services } = await import("../config/services")
  const code = await runTelegramCli({
    services: await services(),
    tools: ctx.tools,
    personas: ctx.personas,
    models: ctx.models
  })
  await ctx.shutdown()
  process.exit(code)
}
