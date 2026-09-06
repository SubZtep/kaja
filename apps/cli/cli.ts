import { color } from "bun"
import { detectAndSetLanguage } from "./lib/cli/bootstrap"
import { runFirstRunIfNeeded } from "./lib/cli/first-run"
import { getConfigPath, isConfigExists, validate } from "./lib/config/config"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { runConfigSubcommand } from "./subcommands/config"
import { runMemorySubcommand } from "./subcommands/memory"
import { runSubcommand } from "./subcommands/run"
import { runRemoteSubcommand } from "./subcommands/run-remote"
import { runSessionSubcommand } from "./subcommands/session"
import { runTelegramSubcommand } from "./subcommands/telegram"
import { runWebSubcommand } from "./subcommands/web"

try {
  // MARK: On-Boarding

  await detectAndSetLanguage()

  const { args } = await import("./lib/cli/args")

  const useLocal = args.flags.remote ? false : args.flags.local || (await isConfigExists())
  if (!useLocal) {
    await runRemoteSubcommand()
    process.exit(0)
  }

  if (!(await isConfigExists())) {
    await runFirstRunIfNeeded(args.flags.headless)
  }

  if (!(await validate())) {
    console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
    process.exit(1)
  }

  // MARK: Run Commands

  const [cmd] = args.input

  if (cmd === "memory") {
    await runMemorySubcommand(args)
  }

  if (cmd === "session") {
    await runSessionSubcommand(args)
  }

  if (cmd === "web") {
    await runWebSubcommand(args)
  }

  if (cmd === "config") {
    await runConfigSubcommand(args)
  }

  // MARK: Start Agent

  if (cmd === "telegram") {
    await runTelegramSubcommand()
  }

  // MARK: End of Headless

  if (args.flags.headless) {
    console.log(t("cli.headlessNoSubcommand"))
    process.exit(1)
  }

  await runSubcommand(args)
} catch (error) {
  log.error("Unhandled startup error", { error })
  const message = error instanceof Error ? error.message : String(error)
  console.log(`${color("red", "ansi")}${t("cli.startupError", { message })}`)
  process.exit(1)
}
