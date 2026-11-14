import type { SQL } from "bun"

/** The modules an admin switched off for everyone; every other module is on. */
export async function disabledModules(sql: SQL): Promise<Set<string>> {
  const rows = await sql<{ module: string }[]>`SELECT module FROM module_state WHERE enabled = ${false}`
  return new Set(rows.map(row => row.module))
}

/** Switches a module on or off for everyone: off, it has no tools, no prompt section and no jobs. */
export async function setModuleEnabled(sql: SQL, moduleId: string, enabled: boolean): Promise<void> {
  await sql.begin(
    tx => tx`
      INSERT INTO module_state (module, enabled, updated_at) VALUES (${moduleId}, ${enabled}, ${new Date().toISOString()})
      ON CONFLICT (module) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`
  )
}
