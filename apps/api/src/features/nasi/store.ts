import { createSqlStore, type NasiStore } from "@kaja/nasi"
import { sql } from "../../core/db"
import { objects } from "../../core/files"
import { reportError } from "../../core/report"

/** One account's nasi store: the shared `Bun.SQL` store on Postgres, its images in the bucket. */
export function nasiStore(userId: string): NasiStore {
  return createSqlStore(sql, {
    userId,
    defaultChannel: "web",
    objects,
    // Reported, so a stored shape the conversation schema doesn't know yet shows up
    onInvalid: (sessionId, error) => reportError("Stored session failed validation", error, { sessionId })
  })
}
