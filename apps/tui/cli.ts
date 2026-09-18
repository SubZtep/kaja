import { color } from "bun"
import { detectAndSetLanguage } from "./lib/cli/bootstrap"
import { runFirstRunIfNeeded } from "./lib/cli/first-run"
import { createCloud, getConfigPath, isConfigExists, validate } from "./lib/config/config"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { hasConfiguredChatModel } from "./lib/models/models"
import { runConfigSubcommand } from "./subcommands/config"
import { runDoctorSubcommand } from "./subcommands/doctor"
import { runLogoutSubcommand } from "./subcommands/logout"
import { runSubcommand } from "./subcommands/run"
import { runCloudSubcommand } from "./subcommands/run-cloud"
import { runTelegramSubcommand } from "./subcommands/telegram"

try {
  // MARK: On-Boarding

  await detectAndSetLanguage()

  const { args } = await import("./lib/cli/args")

  if (args.input[0] === "logout") {
    await runLogoutSubcommand()
    process.exit(0)
  }

  // Manages local config files only — must never trigger cloud login, including on a fresh
  // install with nothing configured yet (e.g. `kaja config wizard` to set one up).
  if (args.input[0] === "config") {
    await runConfigSubcommand(args)
    process.exit(0)
  }

  const useLocal = args.flags.cloud ? false : args.flags.local || (await hasConfiguredChatModel())
  if (!useLocal) {
    if (!(await isConfigExists())) await createCloud()
    await runCloudSubcommand()
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

  if (cmd === "doctor") {
    await runDoctorSubcommand()
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
