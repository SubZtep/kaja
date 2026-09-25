import { expect, test } from "bun:test"
import { tokensLabel } from "../../components/layout/header"

test("tokensLabel is empty before the first reply", () => {
  expect(tokensLabel(null, 32_768)).toBe("")
})

test("tokensLabel shows the count alone until the window is known, then how full it is", () => {
  expect(tokensLabel(12_345, null)).toBe(` · ${(12_345).toLocaleString()} tokens`)
  expect(tokensLabel(12_345, 32_768)).toBe(` · ${(12_345).toLocaleString()} / 33K tokens (38%)`)
  expect(tokensLabel(7_517, 1_000_000)).toBe(` · ${(7_517).toLocaleString()} / 1M tokens (1%)`)
})
