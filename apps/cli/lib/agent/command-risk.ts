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
  /\bchmod\s+-R\s+\d*\s*\/(\s|$)/
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
