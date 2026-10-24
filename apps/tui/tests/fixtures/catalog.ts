import { PUBLIC_CATALOG_VERSION, type PublicCatalog } from "@kaja/schema/api"
import type { ModelTask } from "@kaja/schema/config"

// A model that is its provider's default for `tasks`, and takes images unless it's text-only.
const model = (name: string, tasks: ModelTask[], images = true) => ({
  model: name,
  name: null,
  tasks,
  default_tasks: tasks,
  context_window: null,
  images
})

/** `GET /config/catalog` as the tests see it: six providers, two of them overlapping on chat. */
export const TEST_CATALOG: PublicCatalog = {
  version: PUBLIC_CATALOG_VERSION,
  providers: [
    {
      id: "fireworks",
      name: "Fireworks",
      kind: "hosted",
      base_url: "https://api.fireworks.ai/inference/v1",
      note: null,
      doc: null,
      models: [
        model("accounts/fireworks/models/minimax-m3", ["chat", "vision"]),
        model("accounts/fireworks/models/qwen3-embedding-8b", ["embedding"]),
        model("accounts/fireworks/models/qwen3-reranker-8b", ["rerank"]),
        model("accounts/fireworks/models/glm-5p3-flash", ["summarize"])
      ]
    },
    {
      id: "ollama",
      name: "Ollama",
      kind: "self-hosted",
      base_url: "http://localhost:11434/v1",
      note: "needs an api_key in secrets.toml, any value",
      doc: null,
      models: [model("qwen3.5:4b", ["chat", "vision"]), model("qwen3-embedding:0.6b", ["embedding"])]
    },
    {
      id: "llama",
      name: "llama.cpp",
      kind: "self-hosted",
      base_url: "http://localhost:8080/v1",
      note: null,
      doc: null,
      models: [model("mistralai/Ministral-3-3B-Reasoning-2512-GGUF:Q4_K_M", ["chat"])]
    },
    {
      id: "xai",
      name: "xAI",
      kind: "hosted",
      base_url: "https://api.x.ai/v1",
      note: null,
      doc: null,
      models: [model("grok-4.3", ["chat", "vision"]), model("grok-imagine-image", ["image-generation"])]
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      kind: "hosted",
      base_url: "https://openrouter.ai/api/v1",
      note: null,
      doc: null,
      models: [model("stealth/space-bunny-alpha", ["chat"])]
    },
    {
      id: "speaches",
      name: "Speaches",
      kind: "self-hosted",
      base_url: "http://localhost:8000",
      note: "local server, no key needed",
      doc: null,
      models: [model("speaches-ai/Kokoro-82M-v1.0-ONNX-fp16", ["tts"]), model("Systran/faster-whisper-small", ["stt"])]
    }
  ]
}
