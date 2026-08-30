import { join, resolve } from "node:path"
import * as z from "zod"

const uuidv7 = z.uuidv7()

export function nasiDataDir() {
  return process.env.NASI_DATA_DIR?.trim() || "/var/lib/kaja/nasi"
}

/** SQLite path for an authenticated user. Never takes a client-supplied path segment. */
export function userSqlitePath(userId: string): string {
  const parsed = uuidv7.safeParse(userId)
  if (!parsed.success) throw new Error("invalid user id")
  const root = resolve(nasiDataDir())
  const dir = resolve(join(root, parsed.data))
  if (!dir.startsWith(`${root}/`) && dir !== root) throw new Error("nasi path escaped data dir")
  return join(dir, "nasi.sqlite")
}
