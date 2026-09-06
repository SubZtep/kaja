import { join, resolve } from "node:path"
import * as z from "zod"
import { env } from "../../core/env"

const uuidv7 = z.uuidv7()

export function nasiDataDir() {
  return env.NASI_DATA_DIR
}

/** SQLite path for an authenticated user. Never takes a client-supplied path segment. */
export function userSqlitePath(userId: string): string {
  const parsed = uuidv7.safeParse(userId)
  if (!parsed.success) throw new Error("invalid user id")
  const root = resolve(nasiDataDir())
  const path = resolve(join(root, `${parsed.data}.sqlite`))
  if (!path.startsWith(`${root}/`)) throw new Error("nasi path escaped data dir")
  return path
}
