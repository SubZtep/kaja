/** Wrong codes one Telegram user may send before this process ignores them for good. */
export const MAX_PAIRING_ATTEMPTS = 5

// No 0/O or 1/I/L, so a code read off the terminal can't be mistyped into another valid one.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

/** A fresh 8-character code as `XXXX-XXXX`; a dash is valid in a t.me `?start=` payload. */
export function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length])
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`
}

function normalizeCode(text: string): string {
  return text.toUpperCase().replaceAll(/[^0-9A-Z]/g, "")
}

/** What the bot does with one incoming update. */
export type PairingVerdict = "owner" | "paired" | "ignore"

/**
 * Who may use the local bot: the owners saved in secrets.toml, plus whoever sends the one-time code while
 * it's open. Anyone else gets silence, and a user who sends too many wrong codes is ignored until restart.
 * Pure state; the caller saves a new owner and sends the replies.
 */
export function createPairing(init: { ownerIds: number[]; code: string | undefined }) {
  const owners = new Set(init.ownerIds)
  let code = init.code
  const attempts = new Map<number, number>()

  return {
    /** The code still waiting to be used, if pairing is open. */
    get code() {
      return code
    },
    isOwner(userId: number) {
      return owners.has(userId)
    },
    /** Checks a text message: an owner passes, a matching `/start <code>` or bare code pairs its sender and closes pairing. */
    check(userId: number, text: string): PairingVerdict {
      if (owners.has(userId)) return "owner"
      if (!code) return "ignore"
      const tries = attempts.get(userId) ?? 0
      if (tries >= MAX_PAIRING_ATTEMPTS) return "ignore"
      const payload = text.replace(/^\/start(@\S+)?\s*/, "")
      if (normalizeCode(payload) === normalizeCode(code)) {
        owners.add(userId)
        code = undefined
        return "paired"
      }
      attempts.set(userId, tries + 1)
      return "ignore"
    }
  }
}
