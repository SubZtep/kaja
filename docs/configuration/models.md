---
layout: page
title: Models
parent: Configuration
nav_order: 3.2
---

# Models

`models.toml` declares providers and model definitions. Each provider's `api_key` lives in
[`secrets.toml`](/configuration/secrets) under a matching `[providers.<name>]` table — this file
only holds `base_url` and the model catalog.

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

[[models]]
model = "llama3.2:1b"
task = "chat"
```

Ollama needs *some* `api_key` string even though it ignores its value — set it in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

Notes:

- The shipped templates cover local Ollama (`llama3.2:1b`, `qwen2.5:0.5b`, `qwen3:1.7b`, `llama3.2:3b`) and hosted Fireworks.
- To switch which model handles a task, set `models.<task>` in `settings.toml` directly to that model's `{model, provider}` pair.

---

Next:

[Services](/configuration/services){: .btn .btn-green .fs-5 }
