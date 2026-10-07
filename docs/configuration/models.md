---
layout: page
title: Models
parent: Configuration
nav_order: 3
summary: "models.toml: providers and the model for each task."
icon: 🤖
---

# models.toml

`models.toml` declares providers and the models they serve, and the order of the models decides which one
handles each task. A provider's
`api_key` lives in [`secrets.toml`](/configuration/secrets) under the same `[providers.<name>]` table. This
file only holds `base_url` and the models.

```toml
[providers.ollama]
base_url = "http://localhost:11434/v1"

[models.qwen3-5-4b]
model = "qwen3.5:4b"
provider = "ollama"
tasks = ["chat", "summarize"]

[models.llama3-2-1b]
model = "llama3.2:1b"
provider = "ollama"
tasks = ["chat"]
```

**Each task uses the first model in the file that lists it.** Above, chat and summarize both use
`qwen3-5-4b`, and `llama3-2-1b` waits behind it. To switch, comment the first one out (the next one listing
the task takes over) or move another above it. A task no model lists is off, along with the features that
need it. `chat` is **required** in local mode, and without it the CLI exits with an error.

The tasks:

- `chat`
- `embedding`
- `image-generation`
- `tts` and `stt`
- `rerank`
- `summarize`: writes the summary a long conversation is [compacted](/configuration/config#context) into,
  condenses oversized tool results and runs the `summarize` tool. The chat model does it when there's none.

Each `[models.<id>]` entry has:

- `model`: the provider's own model name, sent in API requests;
- `provider`: a key from `[providers.*]`;
- `tasks`: what it can be used for. One model can serve several, like chat and summarize above;
- `context_window`: optional, how many tokens the model takes in.

The id is yours to choose. The wizard uses the last part of the model name, cleaned up (`qwen3.5:4b` becomes
`qwen3-5-4b`, `accounts/fireworks/models/glm-5p3-flash` becomes `glm-5p3-flash`), and adds `-<provider>` when
two providers serve the same name. A purely numeric id is refused, since it would lose its place in the order.
The models further down stay in the file, for a [persona](/abilities/personas) to pin by id, or for
[`kaja doctor`](/configuration/commands#checking-keys-and-models) to fall back to when the one in use stops
answering. Falling back comments out the broken model, so the next one takes over.

The header shows how full the chat model's context is (`12,345 / 32,768 tokens (38%)`). Without
`context_window`, Kaja asks the server once per run. llama.cpp and Ollama report the size they actually run
with, and some hosted providers list it with their models. If nothing answers, it assumes 32,768.
`kaja doctor` shows the number each chat model got and where it came from. Set it by hand when the guess is
wrong, for example when you start Ollama with a bigger `num_ctx`:

```toml
[models.qwen3-5-4b]
model = "qwen3.5:4b"
provider = "ollama"
tasks = ["chat"]
context_window = 65536
```

Ollama ignores the key but needs *some* value, so set one in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

## Examples

Example files live in [`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config). They're
generated from [`catalog.toml`](https://github.com/SubZtep/kaja/blob/main/docs/config/catalog.toml), the
same provider catalog the setup wizard writes `models.toml` from. Each example shows one model per task, and
the wizard also keeps the models it didn't pick, for pins and switching.

| File | Providers | Tasks |
| --- | --- | --- |
| `models.ollama.toml` | Ollama | chat (`qwen3.5:4b`), embedding. Fully local |
| `models.default.toml` | Fireworks, xAI, Speaches | chat, summarize, embedding, rerank, image-generation, tts, stt. What `kaja config fetch --offline` writes |
| `models.llama.toml` | llama.cpp | chat against a local `llama-server` |
| `models.xai.toml` | xAI | chat (`grok-4.3`), image-generation. One hosted key |
| `models.openrouter.toml` | OpenRouter | chat (`stealth/space-bunny-alpha`). One hosted key |

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
