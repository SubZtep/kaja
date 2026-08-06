import { expect, test } from "bun:test"
import { shortModelLabel } from "../../components/layout/header"

test("shortModelLabel keeps plain ids", () => {
  expect(shortModelLabel("kaja-free-chat")).toBe("kaja-free-chat")
  expect(shortModelLabel("nemotron-3-ultra-free")).toBe("nemotron-3-ultra-free")
})

test("shortModelLabel takes the last path segment", () => {
  expect(shortModelLabel("accounts/fireworks/models/llama-v3p1-70b-instruct")).toBe("llama-v3p1-70b-instruct")
})
