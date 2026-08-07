import { expect, test } from "bun:test"
import { titleCase } from "../"

test("titleCase keeps plain ids", () => {
  expect(titleCase("kaja-free-chat")).toBe("Kaja Free Chat")
  expect(titleCase("nemotron-3-ultra-free")).toBe("Nemotron 3 Ultra Free")
})

test("titleCase takes the last path segment", () => {
  expect(titleCase("accounts/fireworks/models/llama-v3p1-70b-instruct")).toBe("Llama V3p1 70b Instruct")
})

test("titleCase capitalizes each word, replacing separators with spaces", () => {
  expect(titleCase("kimi-k2p6")).toBe("Kimi K2p6")
  expect(titleCase("fireworks")).toBe("Fireworks")
  expect(titleCase("llama_v3p1_70b_instruct")).toBe("Llama V3p1 70b Instruct")
  expect(titleCase("nemotron-3-ultra-free")).toBe("Nemotron 3 Ultra Free")
})
