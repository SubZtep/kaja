import { expect, test } from "bun:test"
import { modelSlug, uniqueModelSlug } from "../index"

test("modelSlug keeps the last path part, lowercased, with other characters as dashes", () => {
  expect(modelSlug("accounts/fireworks/models/glm-5p3-flash")).toBe("glm-5p3-flash")
  expect(modelSlug("qwen3.5:4b")).toBe("qwen3-5-4b")
  expect(modelSlug("Systran/faster-whisper-small")).toBe("faster-whisper-small")
  expect(modelSlug("mistralai/Ministral-3-3B-Reasoning-2512-GGUF:Q4_K_M")).toBe(
    "ministral-3-3b-reasoning-2512-gguf-q4-k-m"
  )
  expect(modelSlug("///")).toBe("model")
})

test("uniqueModelSlug adds the provider for a name already taken, then a number", () => {
  const taken = new Set(["qwen3-5-4b"])
  expect(uniqueModelSlug(taken, "qwen3.5:4b", "ollama")).toBe("qwen3-5-4b-ollama")
  taken.add("qwen3-5-4b-ollama")
  expect(uniqueModelSlug(taken, "qwen3.5:4b", "ollama")).toBe("qwen3-5-4b-ollama-2")
  expect(uniqueModelSlug(taken, "grok-4.3", "xai")).toBe("grok-4-3")
})
