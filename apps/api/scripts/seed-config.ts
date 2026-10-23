#!/usr/bin/env bun
// Idempotent upsert of config/models.default.toml (generated from config/catalog.toml) into Postgres —
// the admin-managed model defaults the cloud API and `kaja config fetch` serve from the DB.
// Only the models in use are seeded (each task's first entry that lists it), with the tasks they win: they are marked free, and free models'
// credentials are handed out publicly, so an alternative, should the file ever gain one, is left for an admin to add.
// Self-hosted providers (the catalog's kind, e.g. Speaches on localhost) are skipped: the server can't reach a user's own machine.
// ON CONFLICT DO NOTHING so admin edits made after the first run always survive a re-run.
// Called by apps/api/migrate.ts after the SQL files, so a deploy seeds a fresh database.
import { CatalogFileSchema, ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { SQL, TOML } from "bun"
import CATALOG_TOML from "../../../config/catalog.toml" with { type: "text" }
import MODELS_TEMPLATE from "../../../config/models.default.toml" with { type: "text" }

async function seedModels(db: SQL) {
  const data = ModelsFileSchema.parse(TOML.parse(MODELS_TEMPLATE))

  const selfHosted = new Set(
    CatalogFileSchema.parse(TOML.parse(CATALOG_TOML))
      .providers.filter(provider => provider.kind === "self-hosted")
      .map(provider => provider.id)
  )
  const won = new Set<ModelTask>()
  const defaults = Object.values(data.models)
    .map(entry => {
      const tasks = entry.tasks.filter(task => !won.has(task))
      for (const task of tasks) won.add(task)
      return { ...entry, tasks }
    })
    .filter(entry => entry.tasks.length > 0 && !selfHosted.has(entry.provider))
  const used = new Set(defaults.map(entry => entry.provider))

  const providerIds: Record<string, string> = {}
  for (const [name, provider] of Object.entries(data.providers)) {
    if (!used.has(name)) continue
    const [row] = await db<{ id: string }[]>`
      INSERT INTO provider (name, base_url)
      VALUES (${name}, ${provider.base_url})
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id`
    providerIds[name] = row!.id
  }

  let count = 0
  for (const entry of defaults) {
    const providerId = providerIds[entry.provider]
    if (!providerId) continue
    const existing = await db`SELECT id FROM model WHERE provider_id = ${providerId} AND model = ${entry.model}`
    if (existing.length > 0) continue
    await db`
      INSERT INTO model (provider_id, model, tasks, enabled, free)
      VALUES (${providerId}, ${entry.model}, ${entry.tasks}, true, true)`
    count++
  }
  console.log(`Seeded ${used.size} providers, ${count} models`)
}

/**
 * Seeds the admin-managed defaults onto an existing connection. Safe to re-run — every insert is a no-op once the row
 * exists.
 */
export async function seedConfig(db: SQL) {
  await seedModels(db)
}

// Standalone entry (`bun seed:config`); no-op when imported by migrate.ts.
if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set")
    process.exit(1)
  }

  const db = new SQL({ url: databaseUrl, max: 1 })
  try {
    await seedConfig(db)
  } finally {
    await db.close()
  }
}
