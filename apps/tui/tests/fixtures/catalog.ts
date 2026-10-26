import type { ModelTask } from "@kaja/schema/config"
import type { CatalogModel, CatalogProvider } from "../../src/lib/models/catalog"

// A model for `tasks`; a chat one calls tools, and takes images when it can do vision.
const model = (name: string, tasks: ModelTask[], released?: string): CatalogModel => ({
  model: name,
  tasks,
  ...(tasks.includes("chat") ? { toolCall: true } : {}),
  ...(tasks.includes("chat") && !tasks.includes("vision") ? { images: false } : {}),
  ...(released ? { released } : {})
})

/** The catalog as the tests see it: six providers, Fireworks and Ollama overlapping on chat, embedding and vision. */
export const TEST_CATALOG: CatalogProvider[] = [
  {
    id: "fireworks",
    name: "Fireworks",
    kind: "hosted",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    env: ["FIREWORKS_API_KEY"],
    models: [
      model("accounts/fireworks/models/minimax-m3", ["chat", "summarize", "vision"], "2026-09-01"),
      model("accounts/fireworks/models/glm-5p3-flash", ["chat", "summarize"], "2026-06-01"),
      model("accounts/fireworks/models/qwen3-embedding-8b", ["embedding"]),
      model("accounts/fireworks/models/qwen3-reranker-8b", ["rerank"])
    ]
  },
  {
    id: "ollama",
    name: "Ollama",
    kind: "self-hosted",
    baseUrl: "http://localhost:11434/v1",
    note: "needs an api_key in secrets.toml, any value",
    models: [
      model("qwen3.5:4b", ["chat", "summarize", "vision"], "2026-03-01"),
      model("qwen3-embedding:0.6b", ["embedding"])
    ]
  },
  {
    id: "llama",
    name: "llama.cpp",
    kind: "self-hosted",
    baseUrl: "http://localhost:8080/v1",
    models: [model("mistralai/Ministral-3-3B-Reasoning-2512-GGUF:Q4_K_M", ["chat", "summarize"])]
  },
  {
    id: "xai",
    name: "xAI",
    kind: "hosted",
    baseUrl: "https://api.x.ai/v1",
    env: ["XAI_API_KEY"],
    models: [
      model("grok-4.3", ["chat", "summarize", "vision"], "2026-08-01"),
      model("grok-imagine-image", ["image-generation"])
    ]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "hosted",
    baseUrl: "https://openrouter.ai/api/v1",
    env: ["OPENROUTER_API_KEY"],
    models: [model("stealth/space-bunny-alpha", ["chat", "summarize"])]
  },
  {
    id: "speaches",
    name: "Speaches",
    kind: "self-hosted",
    baseUrl: "http://localhost:8000",
    note: "local server, no key needed",
    models: [model("speaches-ai/Kokoro-82M-v1.0-ONNX-fp16", ["tts"]), model("Systran/faster-whisper-small", ["stt"])]
  }
]
