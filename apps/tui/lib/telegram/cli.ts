import type { CliResolvedModel } from "@kaja/schema/config"
import type { Tool } from "../agent/agents"
import { installShutdownHandlers } from "../cli/headless"
import { t } from "../i18n"
import type { Persona } from "../personas/personas"

/** Runs `kaja telegram`: a long-polling bot reusing the terminal's tools/personas/models. Returns an exit code once gracefully stopped (SIGINT/SIGTERM). */
export async function runTelegramCli(deps: {
  /** The bot token from secrets.toml's `[telegram]`; without one there is nothing to run. */
  botToken: string | undefined
  tools: Tool<any>[]
  personas: Persona[]
  models: CliResolvedModel[]
  /** Closes long-lived tool connections (e.g. Playwright MCP subprocess); shared with SIGINT/SIGTERM via installShutdownHandlers. */
  closeTools: () => Promise<void>
}): Promise<number> {
  if (!deps.botToken) {
    console.log(t("telegram.notConfigured"))
    return 1
  }

  const { createTelegramBot } = await import("./bot")
  const { chatModelId, client, clientForModel } = await import("../models/openai")
  const { getStore } = await import("../memory/store")
  const bot = createTelegramBot({
    botToken: deps.botToken,
    agentConfig: {
      model: chatModelId,
      client,
      createClient: clientForModel,
      store: await getStore(),
      tools: deps.tools,
      personas: deps.personas,
      models: deps.models
    },
    personas: deps.personas,
    models: deps.models
  })

  const shutdown = installShutdownHandlers(deps.closeTools, {
    onSignal: () => {
      bot.stop().catch(() => {})
    }
  })

  console.log(t("telegram.starting"))
  try {
    await bot.start()
    return 0
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    await shutdown()
  }
}
