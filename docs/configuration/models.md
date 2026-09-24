---
layout: page
title: Models
parent: Configuration
nav_order: 2
---

# models.toml

`models.toml` declares providers, the models they serve, and which model handles each task. A
provider's `api_key` lives in [`secrets.toml`](/configuration/secrets) under the same
`[providers.<name>]` table; this file holds only `base_url` and the models.

```toml
[providers.ollama]
base_url = "http://localhost:11434/v1"

[models.chat]
model = "qwen3.5:4b"
task = "chat"
provider = "ollama"
```

Each `[models.<id>]` entry has:

- `model` — the provider's own model name, sent in API requests;
- `task` — `chat`, `embedding`, `image-generation`, `tts`, `stt`, `rerank` or `summarize` (writes the
  summary a long conversation is [compacted](/configuration/config#context) into; the chat model does it
  when there's none);
- `provider` — a key from `[providers.*]`;
- `context_window` — optional, how many tokens the model takes in.

The header shows how full the chat model's context is (`12,345 / 32,768 tokens (38%)`). Without
`context_window`, Kaja asks the server once per run: llama.cpp and Ollama report the size they actually
run with, and some hosted providers list it with their models. When nothing answers, it assumes
32,768. `kaja doctor` shows the number each chat model got and where it came from. Set it by hand
when the guess is wrong, for example when you start Ollama with a bigger `num_ctx`:

```toml
[models.chat]
model = "qwen3.5:4b"
task = "chat"
provider = "ollama"
context_window = 65536
```

**The entry whose id equals its task is the one in use**: `[models.chat]` serves chat. Other models for
the same task can sit beside it under other ids — the wizard writes them as `[models.<provider>-<task>]`,
e.g. `[models.ollama-chat]` — for a [persona](/personas) to pin, or for
[`kaja doctor`](/configuration#checking-keys-and-models) to switch to when the one in use stops
answering.

`[models.chat]` is **required** in local mode; without it the CLI exits with an error. The other tasks
stay off, with the features that need them, until their entry exists.

Ollama ignores the key but needs *some* value, so set one in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

## Examples

Four example files live in [`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config).
They are generated from
[`catalog.toml`](https://github.com/SubZtep/kaja/blob/main/docs/config/catalog.toml), the same provider
catalog the setup wizard writes `models.toml` from, in the combination you tick. Each example shows one
model per task; the wizard also keeps the models it didn't pick for a task as `[models.<provider>-<task>]`.

| File | Providers | Tasks |
| --- | --- | --- |
| `models.ollama.toml` | Ollama | chat (`qwen3.5:4b`), embedding — fully local |
| `models.default.toml` | Fireworks, xAI, Speaches | chat, embedding, rerank, image-generation, tts, stt — what `kaja config fetch --offline` writes |
| `models.llama.toml` | llama.cpp | chat against a local `llama-server` |
| `models.xai.toml` | xAI | chat (`grok-4.3`), image-generation — one hosted key |

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
