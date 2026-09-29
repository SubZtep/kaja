/**
 * Patterns that flag a proposed shell command as risky enough to warrant a
 * louder confirm prompt. Deliberately conservative — false negatives (a
 * dangerous command that slips through unflagged) are fine, this is an
 * advisory cue, not a sandbox.
 */
const DANGEROUS_PATTERNS = [
  /\bgit\s+reset\s+--hard\b/i,
  /\bdrop\s+(table|database)\b/i,
  /\bsudo\b/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // fork bomb
  /\bmkfs(\.\w+)?\b/i,
  />\s*\/dev\/sd\w*/,
  /\bchmod\s+-R\s+\d*\/(\s|$)/
] as const

/** Whether a `-...` flag cluster contains both of the given letters (in any order, possibly mixed with other flags), e.g. `-rf`, `-fr`, `-Rfv` for letters "r"/"f". */
function hasComboFlag(command: string, letters: string): boolean {
  const match = /\brm\s+(-[a-z]+)\b/i.exec(command)
  if (!match) return false
  const flags = match[1]!.toLowerCase()
  return [...letters].every(letter => flags.includes(letter))
}

function isDangerousRm(command: string): boolean {
  if (!/\brm\b/i.test(command)) return false
  if (hasComboFlag(command, "rf")) return true
  return /--recursive\b/i.test(command) && /--force\b/i.test(command)
}

function isForcePush(command: string): boolean {
  return /\bgit\s+push\b/i.test(command) && /(--force\b|\B-f\b)/i.test(command)
}

function isRecursiveChownOnRoot(command: string): boolean {
  return /\bchown\s+-R\b/i.test(command) && /\s\/(\s|$)/.test(command)
}

/** Whether a shell command matches a known-risky pattern (rm -rf, force push, sudo, ...). */
export function isDangerousCommand(command: string): boolean {
  if (DANGEROUS_PATTERNS.some(pattern => pattern.test(command))) return true
  return isDangerousRm(command) || isForcePush(command) || isRecursiveChownOnRoot(command)
}

/** Regex sources for commands that run without asking; each must match the whole command. The built-in list, also `docs/config/commands.toml`'s `safe`. */
export const DEFAULT_SAFE_COMMANDS: readonly string[] = [
  String.raw`ls(\s+-[a-zA-Z]+)*(\s+[\w./~-]+)*`,
  String.raw`(cat|head|tail)(\s+-[a-zA-Z0-9]+)*(\s+[\w./~-]+)+`,
  "pwd",
  "whoami",
  "date",
  String.raw`uname(\s+-[a-zA-Z]+)*`,
  String.raw`git (status|diff|log)(?!.*--output)(\s+[\w./=:@^~-]+)*`
]

/** Compiles regex sources into whole-command matchers; a source that isn't a valid regex is returned in `invalid` instead of throwing. */
export function compileSafeCommands(sources: readonly string[]): { patterns: RegExp[]; invalid: string[] } {
  const patterns: RegExp[] = []
  const invalid: string[] = []
  for (const source of sources) {
    try {
      patterns.push(new RegExp(`^(?:${source})$`))
    } catch {
      invalid.push(source)
    }
  }
  return { patterns, invalid }
}

/** The built-in patterns, compiled once, for an agent given none of its own. */
export const DEFAULT_SAFE_PATTERNS = compileSafeCommands(DEFAULT_SAFE_COMMANDS).patterns

// Shell metacharacters that chain into, pipe into or substitute another command (`sh -c` interprets all of them):
// a safe pattern only ever approves one simple invocation, whatever it says
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n]/

/** Whether a command may run without asking: it matches a safe pattern, has no shell metacharacters and isn't dangerous. */
export function isSafeCommand(command: string, patterns: readonly RegExp[]): boolean {
  const trimmed = command.trim()
  if (SHELL_METACHARACTERS.test(trimmed) || isDangerousCommand(trimmed)) return false
  return patterns.some(pattern => pattern.test(trimmed))
}
