import { setWarnHandler } from "@kaja/nasi"
import { consolePalette, paint } from "./components/theme"
import { detectAndSetLanguage } from "./lib/cli/bootstrap"
import { createCloud, getConfigPath, isConfigExists, validate } from "./lib/config/config"
import { modeFromFlags, resolveMode } from "./lib/config/mode"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { runAbilitiesSubcommand } from "./subcommands/abilities"
import { runConfigSubcommand } from "./subcommands/config"
import { runDoctorSubcommand } from "./subcommands/doctor"
import { runLogoutSubcommand } from "./subcommands/logout"
import { runSubcommand } from "./subcommands/run"
import { runCloudSubcommand } from "./subcommands/run-cloud"
import { runSessionsSubcommand } from "./subcommands/sessions"
import { runTelegramSubcommand } from "./subcommands/telegram"

// The agent brain reports skipped abilities and failed MCP connections here; the TUI keeps them in its opt-in log file.
setWarnHandler((message, payload) => log.warn(message, payload))

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

  // Same rule as config: local ability files only, never a cloud login.
  if (args.input[0] === "abilities") {
    await runAbilitiesSubcommand(args)
    process.exit(0)
  }

  // Same rule as config: reads the local session file only, never a cloud login.
  if (args.input[0] === "sessions") {
    await runSessionsSubcommand()
  }

  // Nothing configured yet: ask how to run before branching. The wizard writes preferences.mode, so
  // the choice sticks — without it the mode is guessed from "is there a usable chat model?", which
  // sends anyone who hasn't finished a local setup silently back to cloud login.
  if (!(await isConfigExists())) {
    const { runConfigWizard } = await import("./lib/cli/config-wizard")
    const { text } = await runConfigWizard({ headless: args.flags.headless, mode: modeFromFlags(args.flags) })
    // Cancelled at some step — nothing was written, so there's no config to start from.
    if (!(await isConfigExists())) {
      console.log(text)
      process.exit(0)
    }
    // The wizard may have changed the language; later messages should use the new one.
    await detectAndSetLanguage()
  }

  if ((await resolveMode(args.flags)) === "cloud") {
    if (!(await isConfigExists())) await createCloud()
    await runCloudSubcommand()
    process.exit(0)
  }

  if (!(await validate())) {
    console.log(paint(consolePalette().danger)(t("cli.invalidConfig", { path: getConfigPath() })))
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
  console.log(paint(consolePalette().danger)(t("cli.startupError", { message })))
  process.exit(1)
}
