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
import { runRemoteSubcommand } from "./subcommands/run-remote"
import { runSessionSubcommand } from "./subcommands/session"
import { runTelegramSubcommand } from "./subcommands/telegram"
import { runWebSubcommand } from "./subcommands/web"

try {
  // MARK: On-Boarding

  applyConfigDirOverride(argv.slice(2))
  await detectAndSetLanguage()

  // meow (lib/cli/args.ts) handles --help/--version by printing and exiting
  // immediately, and --paths itself; imported unconditionally so those work
  // whether or not --local is passed.
  const { cli } = await import("./lib/cli/args")

  // Default: hosted login (nasi.tv), no local config needed. --local runs
  // the full local agent loop (shell/MCP/tools) against a self-configured
  // provider instead.
  if (!cli.flags.local) {
    await runRemoteSubcommand()
    process.exit(0)
  }

  if (!(await isExists())) {
    await runFirstRunIfNeeded(cli.flags.headless)
  }
  if (!(await validate())) {
    console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
    process.exit(1)
  }

  // MARK: Run Commands

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

  if (cli.flags.headless) {
    console.log(t("cli.headlessNoSubcommand"))
    process.exit(1)
  }

  await runSubcommand(cli)
} catch (error) {
  log.error({ error }, "Unhandled startup error")
  const message = error instanceof Error ? error.message : String(error)
  console.log(`${color("red", "ansi")}${t("cli.startupError", { message })}`)
  process.exit(1)
}
