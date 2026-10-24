import { describe, expect, test } from "bun:test"
import { kindOf, tasksFor } from "../../src/services/catalog"

describe("tasksFor", () => {
  test.each([
    [{ id: "m" }, ["chat", "summarize"]],
    [{ id: "m", modalities: { input: ["text", "image"], output: ["text"] } }, ["chat", "summarize", "vision"]],
    [{ id: "m", type: "chat", modalities: { input: ["audio"], output: ["audio"] } }, []],
    [{ id: "m", type: "embedding" }, ["embedding"]],
    [{ id: "m", type: "transcription" }, ["stt"]],
    [{ id: "m", type: "speech" }, ["tts"]],
    [{ id: "m", type: "image" }, ["image-generation"]],
    [{ id: "m", type: "reranking" }, ["rerank"]],
    [{ id: "m", type: "video" }, []],
    [{ id: "m", type: "realtime" }, []]
  ])("%j serves %j", (model, tasks) => {
    expect(tasksFor(model) as string[]).toEqual(tasks)
  })
})

describe("kindOf", () => {
  test.each([
    ["https://api.fireworks.ai/inference/v1", "hosted"],
    ["http://127.0.0.1:1234/v1", "self-hosted"],
    ["http://localhost:8080/v1", "self-hosted"],
    ["http://[::1]:8080/v1", "self-hosted"],
    [null, "hosted"]
  ])("%s is %s", (url, kind) => {
    expect(kindOf(url)).toBe(kind as "hosted" | "self-hosted")
  })
})
