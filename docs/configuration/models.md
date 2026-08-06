---
layout: page
title: Models
parent: Configuration
nav_order: 3.2
---

# Models

`models.toml` declares provider credentials and model definitions. Credentials live under `[providers.*]` and models are declared with `[[models]]`.

Each `[[models]]` block should include:

- `id`: a local slug referenced from `config.json`.
- `model`: the provider-specific model name sent in API requests.
- `task`: the task this model serves (`chat`, `embedding`, `image-generation`, `text-to-speech`, `speech-to-text`, `rerank`).
- `provider` (optional): the provider key from `[providers.*]` to use; defaults to `[providers.default]`.

Example:

```toml
[providers.default]
base_url = "http://localhost:11434/v1"
api_key = "ollama"  # required but ignored by Ollama

[[models]]
id = "chat-default"
model = "llama3.2:1b"
task = "chat"
```

Notes:

- The shipped templates cover local Ollama (`llama3.2:1b`, `qwen2.5:0.5b`, `qwen3:1.7b`, `llama3.2:3b`) and hosted Fireworks.
- To switch which model handles a task, update `models.toml` and set the corresponding `models.<task>` id in `config.json`.
