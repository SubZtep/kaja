import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { pool } from "../../src/core/db"
import { resolveModelWithProvider } from "../../src/features/nasi/chat"
import { modelService } from "../../src/services"

describe("model pinning", () => {
  let providerId: string
  const modelName = `pin-test-${faker.string.alphanumeric(8)}`

  beforeAll(async () => {
    const provider = await pool.query<{ id: string }>(
      "INSERT INTO provider (name, base_url) VALUES ($1, $2) RETURNING id",
      [`pin-test-${faker.string.alphanumeric(8)}`, "http://localhost:1"]
    )
    providerId = provider.rows[0]!.id
    await pool.query("INSERT INTO model (provider_id, model, tasks, enabled, free) VALUES ($1, $2, $3, true, true)", [
      providerId,
      modelName,
      ["chat"]
    ])
  })

  afterAll(async () => {
    await pool.query("DELETE FROM provider WHERE id = $1", [providerId])
  })

  test("getModelWithProviderByName resolves an enabled+free model by name", async () => {
    const result = await modelService.getModelWithProviderByName(modelName)
    expect(result?.model.model).toBe(modelName)
    expect(result?.provider.id).toBe(providerId)
  })

  test("getModelWithProviderByName returns null for an unknown model name", async () => {
    const result = await modelService.getModelWithProviderByName(`does-not-exist-${faker.string.alphanumeric(8)}`)
    expect(result).toBeNull()
  })

  test("resolveModelWithProvider reuses the pinned model when it still resolves", async () => {
    const result = await resolveModelWithProvider(modelName)
    expect(result?.model.model).toBe(modelName)
  })

  test("resolveModelWithProvider falls back to a random model when the pinned one is gone", async () => {
    // The seeded model from beforeAll guarantees at least one enabled+free row exists to fall back to.
    const result = await resolveModelWithProvider(`does-not-exist-${faker.string.alphanumeric(8)}`)
    expect(result).not.toBeNull()
  })
})
