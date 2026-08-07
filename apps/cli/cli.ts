import { argv } from "node:process"
import { color } from "bun"
import { applyConfigDirOverride, detectAndSetLanguage } from "./lib/cli/bootstrap"
import { runFirstRunIfNeeded } from "./lib/cli/first-run"
import { getConfigPath, isExists, validate } from "./lib/config/config"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { runConfigSubcommand } from "./subcommands/config"
import { runMemorySubcommand } from "./subcommands/memory"
import { runSubcommand } from "./subcommands/run"
import { runSessionSubcommand } from "./subcommands/session"
import { runTelegramSubcommand } from "./subcommands/telegram"
import { runWebSubcommand } from "./subcommands/web"

try {
  // MARK: On-Boarding

  applyConfigDirOverride(argv.slice(2))
  await detectAndSetLanguage()
  if (!(await isExists())) {
    await runFirstRunIfNeeded()
  }
  if (!(await validate())) {
    console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
    process.exit(1)
  }

  // MARK: Run Commands

  const { cli } = await import("./lib/cli/args")
  const [cmd] = cli.input

  if (cmd === "memory") {
    await runMemorySubcommand(cli)
  }

  if (cmd === "session") {
    await runSessionSubcommand(cli)
  }

  if (cmd === "web") {
    await runWebSubcommand(cli)
  }

  if (cmd === "config") {
    await runConfigSubcommand(cli)
  }

  // MARK: Start Agent

  if (cmd === "telegram") {
    await runTelegramSubcommand()
  }

  // MARK: End of Headless

  await runSubcommand(cli)
} catch (error) {
  log.error({ error }, "Unhandled startup error")
  const message = error instanceof Error ? error.message : String(error)
  console.log(`${color("red", "ansi")}${t("cli.startupError", { message })}`)
  process.exit(1)
}
