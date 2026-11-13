import type { FetchLike, Tool } from "@kaja/nasi"
import type { SQL } from "bun"

/** What a host hands a module for one user. */
export type ModuleContext = {
  /** The host's database (Postgres in the API); the module's statements stay in the dialect it shares with SQLite. */
  sql: SQL
  /** Every statement is scoped to this account. */
  userId: string
  /** Sends the module's web requests (the cloud: through the turn's sandbox); unset connects from this host. */
  send?: FetchLike
}

/** One file's worth of DDL; a module's own name for it, unique within the module. */
export type ModuleMigration = { name: string; sql: string }

/** What a module is without its code: enough to migrate a database, or to know the module exists. */
export type ModuleManifest = {
  /** Kebab-case. Also the ability personas list to get its tools, and the prefix of its tables (`-` as `_`). */
  id: string
  /** Postgres DDL, applied in order after the host's own migrations. */
  migrations: ModuleMigration[]
}

/** A feature with its own tables and agent tools, loaded by a host from the registry's list. */
export type Module = ModuleManifest & {
  /** The module's agent tools for one user's turn. Building them does no I/O. */
  tools(ctx: ModuleContext): Tool[]
}

const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** Checks a manifest where it is written, so a bad id fails at import, not in a user's turn. */
export function defineManifest(manifest: ModuleManifest): ModuleManifest {
  if (!MODULE_ID.test(manifest.id)) throw new Error(`Module id must be kebab-case: ${manifest.id}`)
  const names = new Set(manifest.migrations.map(migration => migration.name))
  if (names.size !== manifest.migrations.length) throw new Error(`Module ${manifest.id} names a migration twice`)
  return manifest
}

/** A module: its manifest plus the code a host runs. */
export function defineModule(manifest: ModuleManifest, code: Omit<Module, keyof ModuleManifest>): Module {
  return { ...manifest, ...code }
}
