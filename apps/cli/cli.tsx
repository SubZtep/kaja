import { color } from "bun"
import { applyConfigDirOverride, detectAndSetLanguage } from "./lib/cli/bootstrap"
import { runFirstRunIfNeeded } from "./lib/cli/first-run"
import { getConfigPath, validate } from "./lib/config/config"
import { t } from "./lib/i18n"
import { log } from "./lib/logger"
import { runConfigSubcommand } from "./subcommands/config"
import { runMemorySubcommand } from "./subcommands/memory"
import { runSubcommand } from "./subcommands/run"
import { runSessionSubcommand } from "./subcommands/session"
import { runTelegramSubcommand } from "./subcommands/telegram"
import { runWebSubcommand } from "./subcommands/web"

log.trace("Startup")

// --config must take effect before the language-detecting config read below; args import must come after (meow builds --help at module load)
applyConfigDirOverride(process.argv.slice(2))
await detectAndSetLanguage()

// Before the config guard on purpose, so --help/--version/--config work even with a missing or invalid config
const { cli } = await import("./lib/cli/args")

// memory/session/web/config: browsing/fixing config must work even with a missing or invalid LLM config, so these run before the config guard.
switch (cli.input[0]) {
  case "memory":
    await runMemorySubcommand(cli)
    break
  case "session":
    await runSessionSubcommand(cli)
    break
  case "web":
    await runWebSubcommand(cli)
    break
  case "config":
    await runConfigSubcommand(cli)
    break
}

await runFirstRunIfNeeded()

if (!(await validate())) {
  console.log(`${color("red", "ansi")}${t("cli.invalidConfig", { path: getConfigPath() })}`)
  process.exit(1)
}

// telegram needs a fully-validated config to run a real agent; unknown/no command falls through to the Ink TUI
switch (cli.input[0]) {
  case "telegram":
    await runTelegramSubcommand()
    break
  default:
    await runSubcommand(cli)
}
