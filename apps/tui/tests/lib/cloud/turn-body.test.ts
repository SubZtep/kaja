import { expect, test } from "bun:test"
import { fitTurnBody } from "../../../lib/cloud/turn-body"

const image = (size: number) => ({ data: "A".repeat(size), mimeType: "image/png" })

test("a body that fits is sent as it is", () => {
  const body = { session: "s", toolResults: [{ id: "1", text: "ok", images: [image(10)] }] }
  expect(fitTurnBody(body, 10_000)).toBe(body)
})

test("an oversized body loses its biggest images first, and each result says what it lost", () => {
  const body = {
    session: "s",
    toolResults: [
      { id: "1", text: "first", images: [image(4000), image(100)] },
      { id: "2", text: "second", images: [image(3000)] }
    ]
  }
  const fitted = fitTurnBody(body, 5000)
  expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(5000)
  expect(fitted.toolResults[0]!.images!.map(kept => kept.data.length)).toEqual([100])
  expect(fitted.toolResults[0]!.text).toBe("first\n\n(1 image left out: this turn's request would be too large)")
  expect(fitted.toolResults[1]).toEqual({ id: "2", text: "second", images: [image(3000)] })
})
