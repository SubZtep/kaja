---
layout: page
title: Secrets
parent: Configuration
nav_order: 4
summary: "secrets.toml: every key and token in one place."
icon: 🔑
---

# secrets.toml

`secrets.toml` is the only file you paste a key or token into. Each section matches a table in another file,
or a feature, by name, and is merged in when Kaja starts. Everything else (`base_url`, server addresses,
model names) stays in `models.toml`, `settings.toml` and the ability manifests, so those are safe to commit or
share.

```toml
# The local Telegram bot (`kaja telegram`); owner_ids is filled in by pairing
[telegram]
bot_token = "123456:ABC-DEF..."
owner_ids = [123456789]

# models.toml's [providers.<name>], keyed the same way
[providers]
  [providers.fireworks]
  api_key = "fw_YourSecretKey"

# An ability, by name; its manifest's `auth` says which header, query parameter or env var it goes in
[abilities]
  [abilities.brave-search]
  api_key = "BSA..."

  # Works without a key; one lifts its limits (header Authorization).
  # [abilities.context7]
  # api_key = ""
```

A missing section just turns that feature off. The template ships with every section commented out. The
wizard and `kaja doctor` fill it in for you, testing each key first. The doctor asks for the key of every
ability a persona uses.

A key you skip is written as a commented-out table, like `context7` above, with a note on what it's for. To
add it later, uncomment the two lines and fill in `api_key`. The next save turns it into a real table, and
the next `kaja doctor` drops it when nothing uses it any more. Kaja rewrites this file when it saves a key, so
other comments you add here don't survive that.

---

Next:

[Local storage](/configuration/storage){: .btn .btn-green .fs-5 }
