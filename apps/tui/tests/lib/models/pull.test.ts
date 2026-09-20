import { afterAll, expect, test } from "bun:test"
import type { CliResolvedModel } from "@kaja/schema/config"
import { missingModels, ollamaOrigin, pullModel, withTag } from "../../../lib/models/pull"

// A stand-in Ollama: /api/tags has one model installed, and /api/pull streams progress for
// "new-model", refuses an unknown one the way a real registry miss does, and fails mid-stream for
// "breaks-halfway" (which real pulls do on a dropped connection, still under a 200).
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/api/tags") {
      return Response.json({ models: [{ name: "installed:latest" }] })
    }
    if (url.pathname === "/api/pull") {
      const { model } = (await req.json()) as { model: string }
      if (model === "missing-upstream") {
        return Response.json({ error: "pull model manifest: file does not exist" }, { status: 404 })
      }
      const events =
        model === "breaks-halfway"
          ? ['{"status":"pulling manifest"}', '{"error":"max retries exceeded"}']
          : [
              '{"status":"pulling manifest"}',
              '{"status":"pulling 1234","total":100,"completed":25}',
              '{"status":"success"}'
            ]
      // Split across chunk boundaries mid-object, so the line buffering is exercised too.
      const body = `${events.join("\n")}\n`
      return new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()
            controller.enqueue(encoder.encode(body.slice(0, 20)))
            controller.enqueue(encoder.encode(body.slice(20)))
            controller.close()
          }
        }),
        { headers: { "Content-Type": "application/x-ndjson" } }
      )
    }
    return new Response("not found", { status: 404 })
  }
})

// What models.toml points at: the OpenAI-compatible path, one level below Ollama's own API.
const baseUrl = `http://localhost:${server.port}/v1`

afterAll(() => {
  server.stop()
})

function model(name: string, task: CliResolvedModel["task"] = "chat", url = baseUrl): CliResolvedModel {
  return { id: task, model: name, task, baseUrl: url, provider: "ollama" }
}

test("ollamaOrigin strips the OpenAI-compatible suffix, and only that", () => {
  expect(ollamaOrigin("http://localhost:11434/v1")).toBe("http://localhost:11434")
  expect(ollamaOrigin("http://localhost:11434/v1/")).toBe("http://localhost:11434")
  expect(ollamaOrigin("http://localhost:11434")).toBe("http://localhost:11434")
  // A host that really is called "v1" keeps its name; only a trailing path segment goes.
  expect(ollamaOrigin("http://v1.example/v1")).toBe("http://v1.example")
})

test("withTag matches how /api/tags names an untagged model", () => {
  expect(withTag("llama3.2")).toBe("llama3.2:latest")
  expect(withTag("llama3.2:1b")).toBe("llama3.2:1b")
})

test("missingModels lists only what the server hasn't got", async () => {
  const missing = await missingModels([model("installed"), model("absent", "embedding")])
  expect(missing).toEqual([{ model: "absent", baseUrl }])
})

test("a model named by two tasks is offered once", async () => {
  const missing = await missingModels([model("absent"), model("absent", "embedding")])
  expect(missing).toEqual([{ model: "absent", baseUrl }])
})

test("a server that can't fetch models is left alone", async () => {
  // llama.cpp and every cloud provider 404 on /api/tags — nothing to offer, so nothing is asked.
  const missing = await missingModels([model("absent", "chat", "https://api.fireworks.ai/inference/v1")])
  expect(missing).toEqual([])
})

test("pullModel reports progress and succeeds", async () => {
  const seen: string[] = []
  const result = await pullModel({ model: "new-model", baseUrl }, ({ status, percent }) =>
    seen.push(percent === undefined ? status : `${status} ${percent}%`)
  )
  expect(result).toEqual({ ok: true })
  expect(seen).toEqual(["pulling manifest", "pulling 1234 25%", "success"])
})

test("pullModel surfaces a rejected model without throwing", async () => {
  const result = await pullModel({ model: "missing-upstream", baseUrl })
  expect(result).toEqual({ ok: false, error: "pull model manifest: file does not exist" })
})

test("pullModel fails when the stream reports an error, even under a 200", async () => {
  const result = await pullModel({ model: "breaks-halfway", baseUrl })
  expect(result).toEqual({ ok: false, error: "max retries exceeded" })
})

test("pullModel fails without throwing when the server isn't there", async () => {
  const result = await pullModel({ model: "any", baseUrl: "http://localhost:1/v1" })
  expect(result.ok).toBe(false)
})
