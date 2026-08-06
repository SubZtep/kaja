import { expect, test } from "bun:test"
import { shortModelLabel, titleCase } from "../../components/layout/header"

test("shortModelLabel keeps plain ids", () => {
  expect(shortModelLabel("kaja-free-chat")).toBe("kaja-free-chat")
  expect(shortModelLabel("nemotron-3-ultra-free")).toBe("nemotron-3-ultra-free")
})

test("shortModelLabel takes the last path segment", () => {
  expect(shortModelLabel("accounts/fireworks/models/llama-v3p1-70b-instruct")).toBe("llama-v3p1-70b-instruct")
})

test("titleCase capitalizes each word, replacing separators with spaces", () => {
  expect(titleCase("kimi-k2p6")).toBe("Kimi K2p6")
  expect(titleCase("fireworks")).toBe("Fireworks")
  expect(titleCase("llama_v3p1_70b_instruct")).toBe("Llama V3p1 70b Instruct")
  expect(titleCase("nemotron-3-ultra-free")).toBe("Nemotron 3 Ultra Free")
})
