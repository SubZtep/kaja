/**
 * Shared setup for any entry point that runs the local agent loop without
 * Ink — today just `--local telegram`, eventually other headless consumers
 * (a local daemon/HTTP server, etc.). Factored out of subcommands/run.tsx
 * and subcommands/telegram.ts, which used to duplicate this.
 */

const SHUTDOWN_TIMEOUT_MS = 3000

/** loadModels + loadPersonas + getDefaultTools, the bootstrap every local-loop entry point needs. */
export async function bootstrapLocalAgentDeps() {
  const { loadModels } = await import("../models/models")
  const { loadPersonas } = await import("../personas/personas")
  const { getDefaultTools } = await import("../../tools")

  const models = await loadModels()
  const personas = await loadPersonas()
  const { tools, mcpServers, closeTools } = await getDefaultTools(personas)

  return { models, personas, tools, mcpServers, closeTools }
}

/** Exits the process if no provider is configured — no silent fallback to Kaja's hosted free tier for --local entry points. */
export async function requireConfiguredProvider() {
  const { t } = await import("../i18n")
  const { isFreeChat } = await import("../models/openai")

  if (isFreeChat) {
    console.log(t("cli.localNoProvider"))
    process.exit(1)
  }
}

/**
 * SIGINT/SIGTERM → shutdown → process.exit(0), guarded so SIGINT, normal
 * exit, and a crashed render can't all close tools twice. Force-exits after
 * a timeout so a hung MCP subprocess can't make Ctrl+C stop working.
 * `onSignal` lets a caller (e.g. telegram's bot.stop()) hook into the same
 * signals without installing a second, unguarded handler.
 */
export function installShutdownHandlers(closeTools: () => Promise<void>, options?: { onSignal?: () => void }) {
  let closed = false
  const shutdown = async () => {
    if (closed) return
    closed = true
    await Promise.race([closeTools(), new Promise(resolve => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))])
  }
  const onSignal = async () => {
    options?.onSignal?.()
    await shutdown()
    process.exit(0)
  }
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)

  return shutdown
}
