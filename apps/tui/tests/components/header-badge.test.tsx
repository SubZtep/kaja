import { expect, test } from "bun:test"
import { Header } from "../../components/layout/header"
import { renderForTest } from "../test-utils"

for (const [mode, label] of [
  ["local", "LOCAL"],
  ["cloud", "CLOUD"]
] as const) {
  test(`the ${mode} badge sits at the end of the first header row`, async () => {
    const t = renderForTest(
      <Header mode={mode} persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
    )
    await t.tick()

    const first = t.lastFrame().split("\n")[0]!
    expect(first.trimEnd().endsWith(label)).toBe(true)

    t.unmount()
    await t.waitUntilExit()
  })
}

test("a long tool label or model name keeps the header at two rows", async () => {
  const long = "x".repeat(300)
  for (const props of [
    { currentTool: { name: "web_search", arguments: JSON.stringify({ q: long }) } },
    { model: long }
  ]) {
    const t = renderForTest(
      <Header mode="local" persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} {...props} />
    )
    await t.tick()

    expect(t.lastFrame().trimEnd().split("\n").length).toBeLessThanOrEqual(2)

    t.unmount()
    await t.waitUntilExit()
  }
})
