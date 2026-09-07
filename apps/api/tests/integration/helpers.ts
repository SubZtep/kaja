import { faker } from "@faker-js/faker"
import { pool } from "../../src/core/db"

/** Inserts a provider + an enabled/free chat model under it, returning both ids. Caller must `cleanupModel` in `afterAll`. */
export async function seedModel(namePrefix: string) {
  const provider = await pool.query<{ id: string }>(
    "INSERT INTO provider (name, base_url) VALUES ($1, $2) RETURNING id",
    [`${namePrefix}-${faker.string.alphanumeric(8)}`, "http://localhost:1"]
  )
  const providerId = provider.rows[0]!.id
  const modelName = `${namePrefix}-${faker.string.alphanumeric(8)}`
  await pool.query("INSERT INTO model (provider_id, model, tasks, enabled, free) VALUES ($1, $2, $3, true, true)", [
    providerId,
    modelName,
    ["chat"]
  ])
  return { providerId, modelName }
}

export async function cleanupModel(providerId: string) {
  await pool.query("DELETE FROM provider WHERE id = $1", [providerId])
}
