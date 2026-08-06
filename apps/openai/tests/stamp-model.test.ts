import { describe, expect, test } from "bun:test"
import { KAJA_MODEL_HEADER, withModelHeader } from "../index"

describe("withModelHeader", () => {
  test("sets x-kaja-model to the resolved request model", () => {
    const headers = withModelHeader(new Headers({ "content-type": "text/event-stream" }), "nemotron-3-ultra-free")
    expect(headers.get(KAJA_MODEL_HEADER)).toBe("nemotron-3-ultra-free")
    expect(headers.get("content-type")).toBe("text/event-stream")
  })
})
