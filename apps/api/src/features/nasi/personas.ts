import type { PersonaToml } from "@kaja/schema/api"
import { personaService } from "../../services"

const CACHE_TTL_MS = 30_000

let cache: { personas: PersonaToml[]; expiresAt: number } | undefined

function toPersonaToml(row: Awaited<ReturnType<typeof personaService.listEnabled>>[number]): PersonaToml {
  return {
    id: row.personaId,
    label: row.label,
    instructions: row.instructions ?? undefined,
    when: row.when ?? undefined,
    ...row.sampling
  }
}

/** Drops the cached catalog so the next turn re-reads the table. Called by the admin persona routes — without it an edit takes up to CACHE_TTL_MS to reach cloud chat. Only clears this process's cache; other instances still wait out the TTL. */
export function invalidatePersonaCache() {
  cache = undefined
}

/** The cloud agent loop's persona catalog, read from the `persona` table (admin-managed). Cached in-process for CACHE_TTL_MS so every turn doesn't hit Postgres. */
export async function listPersonas(): Promise<PersonaToml[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.personas
  const rows = await personaService.listEnabled()
  const personas = rows.map(toPersonaToml)
  cache = { personas, expiresAt: Date.now() + CACHE_TTL_MS }
  return personas
}
