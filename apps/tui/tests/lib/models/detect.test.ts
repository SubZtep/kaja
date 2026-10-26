import { afterAll, expect, test } from "bun:test"
import { detectedProvider, detectLocalServers, envCandidates } from "../../../src/lib/models/detect"

// Stand-in servers on random ports, each answering like one kind of local model server
function serve(routes: Record<string, unknown>) {
  return Bun.serve({
    port: 0,
    fetch: req => {
      const body = routes[new URL(req.url).pathname]
      return body === undefined ? new Response("not found", { status: 404 }) : Response.json(body)
    }
  })
}
const models = (...ids: string[]) => ({ data: ids.map(id => ({ id })) })

const generic = serve({ "/v1/models": models("qwen3:8b", "nomic-embed-text") })
const ollama = serve({ "/v1/models": models("llama3.2:latest"), "/api/version": { version: "0.12.0" } })
const speaches = serve({ "/v1/models": models("Systran/faster-whisper-small", "speaches-ai/Kokoro-82M") })
const empty = serve({ "/v1/models": models() })
const servers = [generic, ollama, speaches, empty]
afterAll(() => {
  for (const server of servers) server.stop(true)
})
const at = (server: { port?: number }) => `http://127.0.0.1:${server.port}/v1`

test("a server that lists models is found, one that lists none or doesn't answer isn't", async () => {
  const found = await detectLocalServers({
    candidates: [
      { id: "vllm", name: "vLLM", baseUrl: at(generic) },
      { id: "jan", name: "Jan", baseUrl: at(empty) },
      { id: "kobold", name: "KoboldCpp", baseUrl: "http://127.0.0.1:1/v1" }
    ]
  })
  expect(found).toEqual([{ id: "vllm", name: "vLLM", baseUrl: at(generic), models: ["nomic-embed-text", "qwen3:8b"] }])
})

test("Ollama on another port is still Ollama, and a voice-only server is Speaches at its origin", async () => {
  const found = await detectLocalServers({
    candidates: [
      { id: "llama", name: "llama.cpp", baseUrl: at(ollama) },
      { id: "vllm", name: "vLLM", baseUrl: at(speaches) }
    ]
  })
  expect(found.map(server => [server.id, server.name, server.baseUrl])).toEqual([
    ["ollama", "Ollama", at(ollama)],
    ["speaches", "Speaches", `http://127.0.0.1:${speaches.port}`]
  ])
})

test("the same address asked twice is probed once", async () => {
  const found = await detectLocalServers({
    candidates: [
      { id: "vllm", name: "vLLM", baseUrl: at(generic) },
      { id: "local", name: "OpenAI-compatible", baseUrl: at(generic) }
    ]
  })
  expect(found).toHaveLength(1)
})

test("addresses come from OLLAMA_HOST, llama.cpp's own variables and a local OPENAI_BASE_URL", () => {
  expect(
    envCandidates({
      OLLAMA_HOST: "0.0.0.0:11500",
      LLAMA_ARG_PORT: "9090",
      OPENAI_BASE_URL: "http://192.168.1.20:8000/v1/"
    })
  ).toEqual([
    { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11500/v1" },
    { id: "llama", name: "llama.cpp", baseUrl: "http://127.0.0.1:9090/v1" },
    { id: "local", name: "OpenAI-compatible", baseUrl: "http://192.168.1.20:8000/v1" }
  ])
  // A hosted API in OPENAI_BASE_URL is a provider, not a server running here
  expect(envCandidates({ OPENAI_BASE_URL: "https://api.openai.com/v1" })).toEqual([])
})

test("a found server's models get tasks guessed from their ids", () => {
  const provider = detectedProvider({
    id: "vllm",
    name: "vLLM",
    baseUrl: "http://127.0.0.1:8000/v1",
    models: ["qwen3:8b", "nomic-embed-text", "bge-reranker-v2", "whisper-large-v3", "kokoro-82m"]
  })
  expect(provider.kind).toBe("self-hosted")
  expect(provider.models.map(model => model.tasks)).toEqual([
    ["chat", "summarize"],
    ["embedding"],
    ["rerank"],
    ["stt"],
    ["tts"]
  ])
})
