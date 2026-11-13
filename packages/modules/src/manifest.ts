import { CORE_ID, type ModuleManifest, type ModuleMigration } from "./contract"
import { CORE_SCHEMA } from "./core/schema"
import { readingManifest } from "./reading/manifest"

/**
 * Every module without its code, in the order their migrations apply: for the migrate script, and for a host that only
 * needs the names (the local TUI, where modules don't run yet). The registry's test keeps it in step with `modules`.
 */
export const manifests: readonly ModuleManifest[] = [readingManifest]

/** Every module's id: the ability name a persona lists to get its tools. */
export const MODULE_IDS: readonly string[] = manifests.map(manifest => manifest.id)

/**
 * The module system's own tables, then every module's migrations in order, named `modules/<id>/<name>` so no two share
 * a name (or one with the host's).
 */
export function moduleMigrations(list: readonly ModuleManifest[] = manifests): ModuleMigration[] {
  const ids = new Set(list.map(manifest => manifest.id))
  if (ids.size !== list.length) throw new Error("Two modules share an id")
  return [
    { name: `modules/${CORE_ID}/2026-11-13-module.sql`, sql: CORE_SCHEMA },
    ...list.flatMap(manifest =>
      manifest.migrations.map(migration => ({ name: `modules/${manifest.id}/${migration.name}`, sql: migration.sql }))
    )
  ]
}
