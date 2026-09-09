import { afterEach, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { pool } from "../../src/core/db"
import { personaService } from "../../src/services"

describe("personaService.update", () => {
  const created: string[] = []

  afterEach(async () => {
    for (const id of created.splice(0)) await pool.query("DELETE FROM persona WHERE id = $1", [id])
  })

  async function makePersona() {
    const persona = await personaService.create({
      personaId: `update-test-${faker.string.alphanumeric(8)}`,
      label: "Original label",
      when: "the user asks about wellbeing",
      instructions: "Be kind.",
      enabled: true,
      sortOrder: 0
    })
    created.push(persona.id)
    return persona
  }

  test("an absent key leaves the column untouched", async () => {
    const persona = await makePersona()
    const updated = await personaService.update(persona.id, { label: "New label" })

    expect(updated?.label).toBe("New label")
    expect(updated?.when).toBe("the user asks about wellbeing")
    expect(updated?.instructions).toBe("Be kind.")
  })

  test("an explicit null clears the column", async () => {
    const persona = await makePersona()
    const updated = await personaService.update(persona.id, { when: null, instructions: null })

    expect(updated?.when).toBeNull()
    expect(updated?.instructions).toBeNull()
    expect(updated?.label).toBe("Original label")
  })

  test("an empty patch is a no-op that still returns the row", async () => {
    const persona = await makePersona()
    const updated = await personaService.update(persona.id, {})

    expect(updated?.id).toBe(persona.id)
    expect(updated?.label).toBe("Original label")
  })

  test("returns null for an unknown id", async () => {
    expect(await personaService.update(faker.string.uuid(), { label: "x" })).toBeNull()
  })
})
