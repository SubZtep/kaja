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
`api_key` lives in [`secrets.toml`](/config/secrets) under the same `[providers.<name>]` table. This
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
- `summarize`: writes the summary a long conversation is [compacted](/config/settings#context) into,
  condenses oversized tool results and runs the `summarize` tool. The chat model does it when there's none.
- `vision`: the first model listing it writes each arriving image's short description, in the background.
  With none, an image keeps its alt text (what the tool said about it, say).

Each `[models.<id>]` entry has:

- `model`: the provider's own model name, sent in API requests;
- `provider`: a key from `[providers.*]`;
- `tasks`: what it can be used for. One model can serve several, like chat and summarize above;
- `context_window`: optional, how many tokens the model takes in;
- `images`: optional, `false` for a text-only chat model. It then gets each recent image's description and
  link instead of its pixels (it can still `view_image` the link), and waits for the descriptions to be written.

The id is yours to choose. The wizard uses the last part of the model name, cleaned up (`qwen3.5:4b` becomes
`qwen3-5-4b`, `accounts/fireworks/models/glm-5p3-flash` becomes `glm-5p3-flash`), and adds `-<provider>` when
two providers serve the same name. A purely numeric id is refused, since it would lose its place in the order.
The models further down stay in the file, for a [persona](/abilities/personas) to pin by id, or for
[`kaja doctor`](/config/commands#checking-keys-and-models) to fall back to when the one in use stops
answering. Falling back comments out the broken model, so the next one takes over.

Without `context_window`, Kaja asks the server once per run. llama.cpp and Ollama report the size they actually run
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

Ollama ignores the key but needs _some_ value, so set one in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

## Writing it

You rarely write this file by hand. `kaja config wizard` writes it for you:

- **Online**, it offers the providers Kaja keeps a catalog of, each with a default model per task. The catalog
  follows the providers' own model lists, so `kaja config fetch` later moves your file to the current defaults,
  keeping the address you gave a local server, the provider you picked for each task and any provider of your own.
  The old file is backed up first.
- **Offline**, it asks about your own provider: a name, its address, a key if it needs one, and each model with what
  it's for. When the server lists its models (Ollama, llama.cpp, LM Studio and the hosted APIs do), you pick them
  from that list instead of typing them.

---

Next:

[Secrets](/config/secrets){: .btn .btn-green .fs-5 }
