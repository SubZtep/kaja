import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { resolveModelWithProvider } from "../../src/features/nasi/chat"
import { modelService } from "../../src/services"
import { cleanupModel, seedModel } from "./helpers"

describe("model pinning", () => {
  let providerId: string
  let modelName: string

  beforeAll(async () => {
    ;({ providerId, modelName } = await seedModel("pin-test"))
  })

  afterAll(async () => {
    await cleanupModel(providerId)
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
