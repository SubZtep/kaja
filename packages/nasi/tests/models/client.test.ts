import { expect, test } from "bun:test"
import { noteServedModel, takeLastServedModel } from "../../src/models/client"

test("noteServedModel is consumed once by takeLastServedModel", () => {
  takeLastServedModel()
  noteServedModel("nemotron-3-ultra-free")
  expect(takeLastServedModel()).toBe("nemotron-3-ultra-free")
  expect(takeLastServedModel()).toBeUndefined()
})
