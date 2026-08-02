import { resolve } from "node:path"
import { readConfigLoose, setConfigDirOverride } from "../config/config"
import { detectLanguage, setLanguage } from "../i18n"
import { log } from "../logger"

// supports-hyperlinks (used by marked-terminal for clickable links) only
// recognizes a narrow allowlist of terminals via TERM_PROGRAM/VTE_VERSION;
// it misses terminals like Alacritty unless TERM is literally "alacritty",
// so links silently render as "text (url)" instead of OSC 8 hyperlinks.
// Force it on: it must be set before marked-terminal's first import
// anywhere, since supports-hyperlinks reads process.env once at module load.
if (!process.env.FORCE_HYPERLINK) process.env.FORCE_HYPERLINK = "1"

// The TUI owns the terminal: unless the user asked for a level explicitly,
// silence pino's info chatter (stt/tts progress lines go to stderr and would
// scribble over the Ink UI).
if (!process.env.LOG_LEVEL) log.level = "warn"

/**
 * --config-dir is pre-scanned from argv instead of read from meow: it must
 * take effect before the language-detecting config read, and the args
 * import has to come after that read (meow builds --help at module load).
 * The flag is still declared in lib/args.ts so --help documents it.
 */
export function applyConfigDirOverride(argv: string[]) {
  const i = argv.findIndex(a => a === "--config-dir" || a.startsWith("--config-dir="))
  let value: string | undefined
  if (i === -1) {
    value = undefined
  } else if (argv[i].startsWith("--config-dir=")) {
    value = argv[i].slice("--config-dir=".length)
  } else {
    value = argv[i + 1]
  }
  if (value) setConfigDirOverride(resolve(value))
}

/**
 * i18n first: meow builds --help at module load, so the language must be set
 * before the args import. Config wins; without one (or on first run) the
 * system locale decides.
 */
export async function detectAndSetLanguage() {
  const loose = await readConfigLoose()
  const lang = loose.settings?.language
  setLanguage(lang === "hu" || lang === "en" ? lang : detectLanguage())
}
