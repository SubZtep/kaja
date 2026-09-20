import { afterEach, expect, test } from "bun:test"
import { setWarnHandler, warn } from "../src/warn"

afterEach(() => setWarnHandler(() => {}))

test("is silent until a host sets a handler", () => {
  expect(() => warn("nobody is listening")).not.toThrow()
})

test("forwards the message and payload to the handler", () => {
  const seen: unknown[][] = []
  setWarnHandler((message, payload) => seen.push([message, payload]))
  warn("Skipping enabled skill", { skill: "x" })
  expect(seen).toEqual([["Skipping enabled skill", { skill: "x" }]])
})
