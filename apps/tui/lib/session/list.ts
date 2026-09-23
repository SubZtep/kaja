import { LOCAL_OWNER, type SessionMeta } from "@kaja/schema/store"
import { getTimeAgo } from "@kaja/shared"
import { getLanguage, t } from "../i18n"

/**
 * The text `kaja sessions` prints: the terminal's own sessions, newest first, one per line with the id `kaja -s` takes.
 * Telegram users' sessions share the file but belong to them, so they aren't listed.
 */
export function formatSessionList(sessions: SessionMeta[], now = new Date()): string {
  const own = sessions.filter(session => session.owner === LOCAL_OWNER)
  if (own.length === 0) return t("session.listEmpty")

  const rows = own.map(session => ({
    id: session.id,
    when: getTimeAgo(new Date(session.updatedAt), now, getLanguage()),
    persona: session.persona,
    title: session.title
  }))
  const width = (key: "when" | "persona") => Math.max(...rows.map(row => row[key].length))
  const whenWidth = width("when")
  const personaWidth = width("persona")
  const lines = rows.map(row =>
    `${row.id}  ${row.when.padEnd(whenWidth)}  ${row.persona.padEnd(personaWidth)}  ${row.title}`.trimEnd()
  )
  return [...lines, "", t("session.listHint")].join("\n")
}
