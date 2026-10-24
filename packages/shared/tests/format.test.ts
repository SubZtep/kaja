import { expect, test } from "bun:test"
import { titleCase, trimTrailingSlashes } from "../text"

test("titleCase keeps plain ids", () => {
  expect(titleCase("kaja-free-chat")).toBe("Kaja Free Chat")
  expect(titleCase("nemotron-3-ultra-free")).toBe("Nemotron 3 Ultra Free")
})

test("titleCase takes the last path segment", () => {
  expect(titleCase("accounts/fireworks/models/llama-v3p1-70b-instruct")).toBe("Llama V3.1 70b Instruct")
})

test("titleCase capitalizes each word, replacing separators with spaces", () => {
  expect(titleCase("kimi-k2p6")).toBe("Kimi K2.6")
  expect(titleCase("fireworks")).toBe("Fireworks")
  expect(titleCase("llama_v3p1_70b_instruct")).toBe("Llama V3.1 70b Instruct")
  expect(titleCase("nemotron-3-ultra-free")).toBe("Nemotron 3 Ultra Free")
})

test("titleCase reads p between two numbers as a dot when something comes before it", () => {
  expect(titleCase("minimax-m3p1")).toBe("Minimax M3.1")
  expect(titleCase("Minimax M3p1")).toBe("Minimax M3.1")
  expect(titleCase("deepseek-v3p2-exp")).toBe("Deepseek V3.2 Exp")
  expect(titleCase("gpt-oss-120b")).toBe("Gpt Oss 120b")
  expect(titleCase("glm-5p3")).toBe("Glm 5.3")
  expect(titleCase("accounts/fireworks/models/glm-5p3-flash")).toBe("Glm 5.3 Flash")
  expect(titleCase("5p3")).toBe("5p3")
  expect(titleCase("mp3")).toBe("Mp3")
})

test("trimTrailingSlashes drops every trailing slash and keeps inner ones", () => {
  expect(trimTrailingSlashes("https://kaja.io//")).toBe("https://kaja.io")
  expect(trimTrailingSlashes("/v1/api")).toBe("/v1/api")
  expect(trimTrailingSlashes("/")).toBe("")
  expect(trimTrailingSlashes("a//b")).toBe("a//b")
})
