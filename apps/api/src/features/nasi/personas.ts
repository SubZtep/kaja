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

/** The hosted agent loop's persona catalog, read from the `persona` table (admin-managed). Cached in-process for CACHE_TTL_MS so every turn doesn't hit Postgres. */
export async function listPersonas(): Promise<PersonaToml[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.personas
  const rows = await personaService.listEnabled()
  const personas = rows.map(toPersonaToml)
  cache = { personas, expiresAt: Date.now() + CACHE_TTL_MS }
  return personas
}
