---
layout: page
title: Models
parent: Configuration
nav_order: 3.2
---

# Models

`models.toml` declares provider credentials and model definitions. Credentials live under `[providers.*]` and models are declared with `[[models]]`.

Each `[[models]]` block should include:

- `model`: the provider-specific model name sent in API requests.
- `task`: the task this model serves (`chat`, `embedding`, `image-generation`, `text-to-speech`, `speech-to-text`, `rerank`).
- `provider` (optional): the provider key from `[providers.*]` to use; defaults to whichever provider has `default = true`.

Each `[providers.*]` table may set `default = true` to mark it as that fallback. If several tables set it, the first one (file order) wins.

Example:

```toml
[providers.ollama]
default = true
base_url = "http://localhost:11434/v1"
api_key = "ollama"  # required but ignored by Ollama

[[models]]
model = "llama3.2:1b"
task = "chat"
```

Notes:

- The shipped templates cover local Ollama (`llama3.2:1b`, `qwen2.5:0.5b`, `qwen3:1.7b`, `llama3.2:3b`) and hosted Fireworks.
- To switch which model handles a task, set `models.<task>` in `settings.json` directly to that model's `{model, provider}` pair.
