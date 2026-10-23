/**
 * Runs after the config guard (needs a fully-validated config, tools, personas, and models to run a real agent — unlike
 * memory/session/web/config, which must work even without one) but before Ink ever renders, since this path never
 * touches the terminal UI at all. --headless's first consumer.
 */
export async function runTelegramSubcommand() {
  const { bootstrapLocalAgentDeps, requireConfiguredProvider } = await import("../lib/cli/headless")
  const { runTelegramCli } = await import("../lib/telegram/cli")
  const { secrets } = await import("../lib/config/secrets")
  const { config } = await import("../lib/config/config")
  const { t } = await import("../lib/i18n")

  await requireConfiguredProvider()

  const { models, personas, tools, closeTools, ensureAbilities, safeCommands, signedOutSandboxed } =
    await bootstrapLocalAgentDeps()
  if (signedOutSandboxed.length) console.warn(t("ability.sandboxSignedOut", { names: signedOutSandboxed.join(", ") }))

  const { args } = await import("../lib/cli/args")
  const telegram = (await secrets()).telegram

  const code = await runTelegramCli({
    botToken: telegram?.bot_token,
    ownerIds: telegram?.owner_ids ?? [],
    pair: Boolean(args.flags.pair),
    tools,
    ensureTools: ensureAbilities,
    safeCommands,
    yolo: (await config()).preferences?.yolo,
    personas,
    models,
    closeTools
  })
  process.exit(code)
}
