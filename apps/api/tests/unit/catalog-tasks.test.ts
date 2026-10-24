import { describe, expect, test } from "bun:test"
import { tasksFor } from "../../src/services/catalog"

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
