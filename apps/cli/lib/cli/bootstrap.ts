import { readConfigLoose } from "../config/config"
import { detectLanguage, type Language, setLanguage } from "../i18n"

// supports-hyperlinks (used by the vendored marked-terminal for clickable links, lib/markdown/marked-terminal.ts) only recognizes a narrow allowlist of terminals via TERM_PROGRAM/VTE_VERSION; it misses terminals like Alacritty unless TERM is literally "alacritty", so links silently render as "text (url)" instead of OSC 8 hyperlinks. Force it on: it must be set before lib/markdown/marked-terminal.ts's first import anywhere, since supports-hyperlinks reads process.env once at module load.
if (!process.env.FORCE_HYPERLINK) process.env.FORCE_HYPERLINK = "1"

function toLanguage(value: string | undefined): Language | undefined {
  return value === "hu" || value === "en" || value === "zh-TW" ? value : undefined
}

/** Reads `--lang` straight from argv (as `--lang=hu` or `--lang hu`), bypassing meow's args parser — that parser can't be imported yet (its --help text needs the language already set), so this is a minimal standalone parse of just this one flag. */
function langFlag(): Language | undefined {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const inline = /^--lang=(.+)$/.exec(arg)
    if (inline) return toLanguage(inline[1])
    if (arg === "--lang") return toLanguage(argv[i + 1])
  }
  return undefined
}

/**
 * i18n first: meow builds --help at module load, so the language must be set
 * before the args import. Precedence: --lang flag, then saved config, then
 * (with neither) the system locale.
 */
export async function detectAndSetLanguage() {
  const flagLang = langFlag()
  if (flagLang) {
    setLanguage(flagLang)
    return
  }
  const loose = await readConfigLoose()
  setLanguage(toLanguage(loose.preferences?.language) ?? detectLanguage())
}
