import type { CliResolvedModel } from "@kaja/schema/config"
import type { Tool } from "../agent/agents"
import { installShutdownHandlers } from "../cli/headless"
import { getLanguage, t } from "../i18n"
import type { Persona } from "../personas/personas"

/** Adds a paired user to secrets.toml's `owner_ids`, re-reading the file so ids edited in meanwhile aren't lost. */
async function savePairedOwner(user: { id: number }) {
  const { loadSecretsFile, saveSecrets } = await import("../config/secrets")
  const saved = (await loadSecretsFile()).telegram?.owner_ids ?? []
  await saveSecrets({ telegram: { owner_ids: [...new Set([...saved, user.id])] } })
}

/** Runs `kaja telegram`: a long-polling bot reusing the terminal's tools/personas/models. Returns an exit code once gracefully stopped (SIGINT/SIGTERM). */
export async function runTelegramCli(deps: {
  /** The bot token from secrets.toml's `[telegram]`; without one there is nothing to run. */
  botToken: string | undefined
  /** Telegram user ids already paired (secrets.toml `owner_ids`). */
  ownerIds: number[]
  /** `--pair`: show a code to pair one more person. */
  pair: boolean
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
  const { chatModelId, client, clientForModel, compactAt, summarizer } = await import("../models/openai")
  const { getStore } = await import("../memory/store")
  const { replyLanguageInstructionFor, TELEGRAM_CHANNEL_INSTRUCTION } = await import("@kaja/nasi")
  const bot = createTelegramBot({
    botToken: deps.botToken,
    ownerIds: deps.ownerIds,
    pair: deps.pair,
    onPaired: savePairedOwner,
    agentConfig: {
      model: chatModelId,
      client,
      createClient: clientForModel,
      summarizer,
      compactAt,
      store: await getStore(),
      tools: deps.tools,
      personas: deps.personas,
      models: deps.models,
      // Replies in the language set for the terminal, as its own chat does.
      promptContext: {
        replyLanguageInstruction: replyLanguageInstructionFor(getLanguage()),
        channelInstruction: TELEGRAM_CHANNEL_INSTRUCTION
      }
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
