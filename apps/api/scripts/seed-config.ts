#!/usr/bin/env bun
// Idempotent upsert of docs/config/{personas,models.fireworks,mcp}.toml into Postgres —
// the admin-managed defaults the cloud API and `kaja config fetch` now serve from the DB.
// ON CONFLICT DO NOTHING so admin edits made after the first run always survive a re-run.
// Called by apps/api/migrate.ts after the SQL files, so a deploy seeds a fresh database.
import { TOML } from "bun"
import { Pool } from "pg"
import MCP_TEMPLATE from "../../../docs/config/mcp.toml" with { type: "text" }
import MODELS_TEMPLATE from "../../../docs/config/models.fireworks.toml" with { type: "text" }
import BARKOCHBA_TEMPLATE from "../../../docs/config/personas/barkochba.toml" with { type: "text" }
import CARE_TEMPLATE from "../../../docs/config/personas/care.toml" with { type: "text" }
import DEFAULT_TEMPLATE from "../../../docs/config/personas/default.toml" with { type: "text" }
import ONBOARDING_TEMPLATE from "../../../docs/config/personas/onboarding.toml" with { type: "text" }

/** Minimal surface both `pg`'s Pool and Client satisfy, so migrate.ts can reuse its own connection. */
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }

const PERSONA_TEMPLATES: Record<string, string> = {
  default: DEFAULT_TEMPLATE,
  barkochba: BARKOCHBA_TEMPLATE,
  care: CARE_TEMPLATE,
  onboarding: ONBOARDING_TEMPLATE
}

const SAMPLING_KEYS = [
  "temperature",
  "top_p",
  "top_k",
  "max_tokens",
  "frequency_penalty",
  "presence_penalty",
  "seed"
] as const

async function seedPersonas(db: Queryable) {
  let sortOrder = 0
  for (const [personaId, text] of Object.entries(PERSONA_TEMPLATES)) {
    const data = TOML.parse(text) as Record<string, unknown>
    const sampling: Record<string, unknown> = {}
    for (const key of SAMPLING_KEYS) {
      if (data[key] !== undefined) sampling[key] = data[key]
    }
    await db.query(
      `
      INSERT INTO persona (persona_id, label, "when", instructions, sampling, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (persona_id) DO NOTHING
      `,
      [personaId, data.label, data.when ?? null, data.instructions ?? null, JSON.stringify(sampling), sortOrder++]
    )
  }
  console.log(`Seeded ${Object.keys(PERSONA_TEMPLATES).length} personas`)
}

async function seedModels(db: Queryable) {
  const data = TOML.parse(MODELS_TEMPLATE) as {
    providers: Record<string, { base_url: string }>
    models: Record<string, { model: string; task: string; provider: string }>
  }

  const providerIds: Record<string, string> = {}
  for (const [name, provider] of Object.entries(data.providers)) {
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
  for (const entry of Object.values(data.models)) {
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
  console.log(`Seeded ${Object.keys(data.providers).length} providers, ${count} models`)
}

async function seedMcpServers(db: Queryable) {
  const data = TOML.parse(MCP_TEMPLATE) as { servers: Array<Record<string, unknown>> }
  let count = 0
  for (const server of data.servers ?? []) {
    const result = await db.query(
      `
      INSERT INTO mcp_server (server_id, command, args, env, url, headers, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      ON CONFLICT (server_id) DO NOTHING
      `,
      [
        server.id,
        server.command ?? null,
        JSON.stringify(server.args ?? []),
        JSON.stringify(server.env ?? {}),
        server.url ?? null,
        JSON.stringify(server.headers ?? {})
      ]
    )
    if (result.rowCount) count++
  }
  console.log(`Seeded ${count} MCP servers`)
}

/** Seeds the admin-managed defaults onto an existing connection. Safe to re-run — every insert is a no-op once the row exists. */
export async function seedConfig(db: Queryable) {
  await seedPersonas(db)
  await seedModels(db)
  await seedMcpServers(db)
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
