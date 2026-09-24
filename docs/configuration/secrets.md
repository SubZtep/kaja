---
layout: page
title: Secrets
parent: Configuration
nav_order: 3
---

# secrets.toml

`secrets.toml` is the only file you ever paste a key or token into. Each section matches a table in
another file, or a feature, by name, and is merged in when Kaja starts. Everything else — `base_url`,
server addresses, model names — stays in `models.toml`, `mcp.toml` and `settings.toml`, so those are
safe to commit or share.

```toml
# The local Telegram bot (`kaja telegram`)
[telegram]
botToken = "123456:ABC-DEF..."

# models.toml's [providers.<name>], keyed the same way
[providers.fireworks]
api_key = "fw_YourSecretKey"

# mcp.toml's [[servers]] by id — merged into that server's env (stdio) or headers (HTTP)
[mcp.context7]
CONTEXT7_API_KEY = "ctx7sk-..."

# An HTTP tool or MCP ability, by name
[abilities.brave-search]
apiKey = "BSA..."
```

A missing section just turns that feature off. The template ships with every section commented out.
The wizard, `kaja doctor` and `kaja abilities` fill it in for you, testing each key first.

---

Next:

[abilities.toml](/configuration/abilities){: .btn .btn-green .fs-5 }
