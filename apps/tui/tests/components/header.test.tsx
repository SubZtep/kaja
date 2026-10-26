import { expect, test } from "bun:test"
import { Header, infoParts, tokensLabel } from "../../src/components/layout/header"
import { renderForTest } from "../test-utils"

test("tokensLabel is empty before the first reply", () => {
  expect(tokensLabel(null, 32_768)).toBe("")
})

test("tokensLabel gives the percent while there's room, the full count past half, the count alone without a window", () => {
  expect(tokensLabel(12_345, null)).toBe(`${(12_345).toLocaleString()} tokens`)
  expect(tokensLabel(7_517, 1_000_000)).toBe("1%")
  expect(tokensLabel(12_345, 32_768)).toBe("38%")
  expect(tokensLabel(18_000, 32_768)).toBe(`${(18_000).toLocaleString()} / 33K (55%)`)
})

test("infoParts drops the provider first, then the model", () => {
  expect(infoParts("Model", "Provider", "1%", 40)).toBe("Model · Provider · 1%")
  expect(infoParts("Model", "Provider", "1%", 12)).toBe("Model · 1%")
  expect(infoParts("Model", "Provider", "1%", 5)).toBe("1%")
  expect(infoParts("Model", undefined, "", 40)).toBe("Model")
})

async function frame(props: Partial<Parameters<typeof Header>[0]>, width = 80) {
  const t = renderForTest(
    <Header
      mode="local"
      persona="Kaja"
      model="model"
      promptTokens={null}
      contextWindow={null}
      width={width}
      {...props}
    />,
    { columns: width }
  )
  await t.tick()
  const rows = t
    .lastFrame()
    .trimEnd()
    .split("\n")
    .map(row => row.trimEnd())
  t.unmount()
  await t.waitUntilExit()
  return rows
}

test("one row: the persona, then the model's line, then where it runs as a tag", async () => {
  const rows = await frame({ provider: "fireworks", promptTokens: 7_517, contextWindow: 1_000_000, profile: "dev" })
  expect(rows).toHaveLength(1)
  expect(rows[0]!).toMatch(/Kaja +Model · Fireworks · 1% · local · dev$/)
})

test("YOLO comes before the mode tag, dot-separated like the rest", async () => {
  const rows = await frame({ yolo: true, mode: "cloud" })
  expect(rows[0]!).toMatch(/Model · YOLO · cloud$/)
})

test("a narrow header drops the provider, then the model, and stays one row", async () => {
  const props = { model: "a-long-model-name", provider: "openrouter", promptTokens: 1200, contextWindow: 32_000 }
  expect((await frame(props, 70))[0]!).toMatch(/A Long Model Name · Openrouter · 4% · local$/)
  expect((await frame(props, 50))[0]!).toMatch(/A Long Model Name · 4% · local$/)
  const narrow = await frame(props, 32)
  expect(narrow).toHaveLength(1)
  expect(narrow[0]!).toMatch(/4% · local$/)
})

test("a long tool label or model name keeps the header at one row", async () => {
  const long = "x".repeat(300)
  for (const props of [
    { currentTool: { name: "web_search", arguments: JSON.stringify({ q: long }) } },
    { model: long }
  ])
    expect(await frame(props, 60)).toHaveLength(1)
})
