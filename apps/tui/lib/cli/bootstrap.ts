import { readConfigLoose } from "../config/config"
import { detectLanguage, type Language, setLanguage } from "../i18n"

// supports-hyperlinks (used by the vendored marked-terminal for clickable links, lib/markdown/marked-terminal.ts) only recognizes a narrow allowlist of terminals via TERM_PROGRAM/VTE_VERSION; it misses terminals like Alacritty unless TERM is literally "alacritty", so links silently render as "text (url)" instead of OSC 8 hyperlinks. Force it on: it must be set before lib/markdown/marked-terminal.ts's first import anywhere, since supports-hyperlinks reads process.env once at module load.
if (!process.env.FORCE_HYPERLINK) process.env.FORCE_HYPERLINK = "1"

function toLanguage(value: string | undefined): Language | undefined {
  return value === "hu" || value === "en-GB" || value === "nan-TW" ? value : undefined
}

/**
 * i18n first: meow builds --help at module load, so the language must be set
 * before the args import. Precedence: saved config, else the system locale.
 */
export async function detectAndSetLanguage() {
  const loose = await readConfigLoose()
  setLanguage(toLanguage(loose.preferences?.language) ?? detectLanguage())
}
