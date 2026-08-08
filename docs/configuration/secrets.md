---
layout: page
title: Secrets
parent: Configuration
nav_order: 3.4
---

# Secrets

One file to rule your keys. `secrets.toml` is the **only** file you should ever need to paste an
API key or token into. Everything else — `services.toml`, `models.toml`, `mcp.toml` — stays
readable, shareable, and safe to screenshot.

Each section mirrors a table elsewhere by name, and gets folded back in automatically when Kaja
starts. No wiring, no references, no ceremony — just matching names:

```toml
# Powers services.toml's [api] (used by `kaja config fetch`)
[api]
token = "kaja"

# Powers services.toml's [location] (the location tool)
[location]
apiKey = "kaja"

# Powers services.toml's [webSearch] (the web_search tool)
[webSearch]
apiKey = "BSA..."

# Powers services.toml's [telegram] (the Telegram bot)
[telegram]
botToken = "123456:ABC-DEF..."

# Powers services.toml's [zen] (free OpenCode Zen models)
[zen]
apiKey = "sk-..."

# Powers models.toml's [providers.<name>] tables, keyed the same way
[providers.fireworks]
api_key = "fw_YourSecretKey"

# Powers mcp.toml's [[servers]] entries, keyed by server id — merges into
# that server's env (stdio) or headers (HTTP)
[mcp.context7]
CONTEXT7_API_KEY = "ctx7sk-..."
```

## The rule

**If it's a secret, it lives here. If it's not, it doesn't.** `serviceUrl`, `baseUrl`,
`allowedUserIds`, model names — all of that stays put in `services.toml`/`models.toml`/`mcp.toml`.
Only the sensitive half moves.

This means you can commit, share, or `cat` your other config files without a second thought — no
regex-grepping for stray keys before you paste a config into a support thread.

## Why bother?

Because "which of these four files has my Brave key in it again?" is not a question you should
have to ask. One file, one job: hold the things you'd rather not lose to a `git add .`.

Missing a section? Kaja just skips that feature — same as an omitted section anywhere else. The
`[api]` and `[location]` sections ship active by default with Kaja's own demo credentials, so a
fresh install works immediately with zero edits.

---

Next:

[Voice](/configuration/voice){: .btn .btn-green .fs-5 }
