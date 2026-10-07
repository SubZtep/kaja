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

test("the badge names the KAJA_PROFILE after the mode", async () => {
  const t = renderForTest(
    <Header mode="local" profile="dev" persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
  )
  await t.tick()

  expect(
    t
      .lastFrame()
      .split("\n")[0]!
      .replace(/[^A-Za-z]/g, "")
      .endsWith("LOCALdev")
  ).toBe(true)

  t.unmount()
  await t.waitUntilExit()
})

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

test("yolo puts a YOLO badge after the mode badge", async () => {
  const t = renderForTest(
    <Header mode="local" yolo persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
  )
  await t.tick()

  expect(t.lastFrame().split("\n")[0]!.trimEnd()).toMatch(/LOCAL\s+YOLO$/)

  t.unmount()
  await t.waitUntilExit()
})

// The second space before LOCAL is the badge's own padding, on its tinted background
test("one space between the model, the provider, the tokens and the badge", async () => {
  for (const [promptTokens, expected] of [
    [null, /Model Provider {2}LOCAL$/],
    [1200, /Model Provider · 1,200 tokens {2}LOCAL$/]
  ] as const) {
    const t = renderForTest(
      <Header
        mode="local"
        persona="Kaja"
        model="model"
        provider="provider"
        promptTokens={promptTokens}
        contextWindow={null}
        width={80}
      />
    )
    await t.tick()

    expect(t.lastFrame().split("\n")[0]!.trimEnd()).toMatch(expected)

    t.unmount()
    await t.waitUntilExit()
  }
})
