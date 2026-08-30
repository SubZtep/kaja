import { readConfigLoose } from "../config/config"
import { detectLanguage, setLanguage } from "../i18n"
import { log } from "../logger"

// supports-hyperlinks (used by the vendored marked-terminal for clickable links, lib/markdown/marked-terminal.ts) only recognizes a narrow allowlist of terminals via TERM_PROGRAM/VTE_VERSION; it misses terminals like Alacritty unless TERM is literally "alacritty", so links silently render as "text (url)" instead of OSC 8 hyperlinks. Force it on: it must be set before lib/markdown/marked-terminal.ts's first import anywhere, since supports-hyperlinks reads process.env once at module load.
if (!process.env.FORCE_HYPERLINK) process.env.FORCE_HYPERLINK = "1"

// The TUI owns the terminal: unless the user asked for a level explicitly, silence pino's info chatter (stt/tts progress lines go to stderr and would scribble over the Ink UI).
if (!process.env.LOG_LEVEL) log.level = "warn"

/**
 * i18n first: meow builds --help at module load, so the language must be set
 * before the args import. Config wins; without one (or on first run) the
 * system locale decides.
 */
export async function detectAndSetLanguage() {
  const loose = await readConfigLoose()
  const lang = loose.preferences?.language
  setLanguage(lang === "hu" || lang === "en" ? lang : detectLanguage())
}
