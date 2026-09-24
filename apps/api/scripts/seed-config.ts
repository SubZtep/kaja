#!/usr/bin/env bun
// Idempotent upsert of docs/config/models.default.toml (generated from docs/config/catalog.toml) into Postgres —
// the admin-managed model defaults the cloud API and `kaja config fetch` serve from the DB.
// Only each task's default ([models.<task>]) is seeded: they are marked free, and free models' credentials are
// handed out publicly, so an alternative ([models.<provider>-<task>]), should the file ever gain one, is left for an admin to add.
// Self-hosted providers (the catalog's kind, e.g. Speaches on localhost) are skipped: the server can't reach a user's own machine.
// ON CONFLICT DO NOTHING so admin edits made after the first run always survive a re-run.
// Called by apps/api/migrate.ts after the SQL files, so a deploy seeds a fresh database.
import { CatalogFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { Pool } from "pg"
import CATALOG_TOML from "../../../docs/config/catalog.toml" with { type: "text" }
import MODELS_TEMPLATE from "../../../docs/config/models.default.toml" with { type: "text" }

/** Minimal surface both `pg`'s Pool and Client satisfy, so migrate.ts can reuse its own connection. */
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }

async function seedModels(db: Queryable) {
  const data = TOML.parse(MODELS_TEMPLATE) as {
    providers: Record<string, { base_url: string }>
    models: Record<string, { model: string; task: string; provider: string }>
  }

  const selfHosted = new Set(
    CatalogFileSchema.parse(TOML.parse(CATALOG_TOML))
      .providers.filter(provider => provider.kind === "self-hosted")
      .map(provider => provider.id)
  )
  const defaults = Object.entries(data.models)
    .filter(([id, entry]) => id === entry.task && !selfHosted.has(entry.provider))
    .map(([, entry]) => entry)
  const used = new Set(defaults.map(entry => entry.provider))

  const providerIds: Record<string, string> = {}
  for (const [name, provider] of Object.entries(data.providers)) {
    if (!used.has(name)) continue
    const result = await db.query(
      `
      INSERT INTO provider (name, base_url)
      VALUES ($1, $2)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
      `,
      [name, provider.base_url]
    )
    providerIds[name] = result.rows[0].id
  }

  let count = 0
  for (const entry of defaults) {
    const providerId = providerIds[entry.provider]
    if (!providerId) continue
    const existing = await db.query(`SELECT id FROM model WHERE provider_id = $1 AND model = $2`, [
      providerId,
      entry.model
    ])
    if (existing.rows.length > 0) continue
    await db.query(
      `
      INSERT INTO model (provider_id, model, tasks, enabled, free)
      VALUES ($1, $2, $3, true, true)
      `,
      [providerId, entry.model, [entry.task]]
    )
    count++
  }
  console.log(`Seeded ${used.size} providers, ${count} models`)
}

/** Seeds the admin-managed defaults onto an existing connection. Safe to re-run — every insert is a no-op once the row exists. */
export async function seedConfig(db: Queryable) {
  await seedModels(db)
}

// Standalone entry (`bun seed:config`); no-op when imported by migrate.ts.
if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  try {
    await seedConfig(pool)
  } finally {
    await pool.end()
  }
}
