import { expect, test } from "bun:test"
import { Header } from "../../components/layout/header"
import { renderForTest } from "../test-utils"

for (const [mode, label] of [
  ["local", "LOCAL"],
  ["cloud", "CLOUD"]
] as const) {
  test(`with room, the model and then the ${mode} badge share the first row`, async () => {
    const t = renderForTest(
      <Header mode={mode} persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
    )
    await t.tick()

    const rows = t.lastFrame().trimEnd().split("\n")
    expect(rows).toHaveLength(1)
    expect(rows[0]!).toMatch(new RegExp(`Kaja +M +${label}$`))

    t.unmount()
    await t.waitUntilExit()
  })
}

test("without room, the model keeps the corner and the badges drop below it, flush right", async () => {
  const t = renderForTest(
    <Header
      mode="local"
      yolo
      persona="Kaja"
      model="a-long-model-name"
      promptTokens={1200}
      contextWindow={null}
      width={50}
    />
  )
  await t.tick()

  const rows = t.lastFrame().trimEnd().split("\n")
  expect(rows).toHaveLength(2)
  expect(rows[0]!.trimEnd()).toMatch(/Kaja +A Long Model Name · 1,200 tokens$/)
  expect(rows[1]!.trimEnd()).toMatch(/^ +YOLO +LOCAL$/)

  t.unmount()
  await t.waitUntilExit()
})

test("the badge names the KAJA_PROFILE after the mode", async () => {
  const t = renderForTest(
    <Header mode="local" profile="dev" persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
  )
  await t.tick()

  expect(t.lastFrame().replace(/[^A-Za-z]/g, "")).toContain("LOCALdev")

  t.unmount()
  await t.waitUntilExit()
})

test("a long tool label or model name keeps the header at three rows", async () => {
  const long = "x".repeat(300)
  for (const props of [
    { currentTool: { name: "web_search", arguments: JSON.stringify({ q: long }) } },
    { model: long }
  ]) {
    const t = renderForTest(
      <Header mode="local" persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} {...props} />
    )
    await t.tick()

    expect(t.lastFrame().trimEnd().split("\n").length).toBeLessThanOrEqual(3)

    t.unmount()
    await t.waitUntilExit()
  }
})

test("yolo puts a YOLO badge before the mode badge", async () => {
  const t = renderForTest(
    <Header mode="local" yolo persona="Kaja" model="m" promptTokens={null} contextWindow={null} width={60} />
  )
  await t.tick()

  expect(t.lastFrame().split("\n")[0]!.trimEnd()).toMatch(/M\s+YOLO\s+LOCAL$/)

  t.unmount()
  await t.waitUntilExit()
})

test("the model, the provider and the tokens sit one space apart, before the badge", async () => {
  for (const [promptTokens, expected] of [
    [null, /Kaja +Model Provider +LOCAL$/],
    [1200, /Kaja +Model Provider · 1,200 tokens +LOCAL$/]
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

test("narrower still, the tokens wrap below the model too, without their dot, and every row stays flush right", async () => {
  const header = (width: number) => (
    <Header
      mode="local"
      yolo
      persona="Kaja"
      model="a-long-model-name"
      promptTokens={1200}
      contextWindow={32_000}
      width={width}
    />
  )
  for (const [width, expected] of [
    [100, [/Kaja +A Long Model Name · 1,200 \/ 32K tokens \(4%\) +YOLO +LOCAL$/]],
    [60, [/Kaja +A Long Model Name · 1,200 \/ 32K tokens \(4%\)$/, /^ +YOLO +LOCAL$/]],
    [40, [/Kaja +A Long Model Name$/, /^ +1,200 \/ 32K tokens \(4%\)$/, /^ +YOLO +LOCAL$/]]
  ] as const) {
    const t = renderForTest(header(width), { columns: width })
    await t.tick()
    await t.tick()

    const rows = t
      .lastFrame()
      .trimEnd()
      .split("\n")
      .map(row => row.trimEnd())
    expect(rows).toHaveLength(expected.length)
    expected.forEach((row, i) => {
      expect(rows[i]!).toMatch(row)
    })

    t.unmount()
    await t.waitUntilExit()
  }
})
