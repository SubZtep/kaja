---
layout: page
title: Secrets
parent: Configuration
nav_order: 4.4
---

# Secrets

One file to rule your keys. `secrets.toml` is the **only** file you should ever need to paste an
API key or token into. Everything else — `models.toml`, `mcp.toml`, `settings.toml` — stays
readable, shareable, and safe to screenshot.

Provider and MCP sections mirror a table elsewhere by name, and get folded back in automatically
when Kaja starts. No wiring, no references, no ceremony — just matching names:

```toml
# The web_search tool
[webSearch]
apiKey = "BSA..."

# The Telegram bot (`kaja telegram`)
[telegram]
botToken = "123456:ABC-DEF..."

# Powers models.toml's [providers.<name>] tables, keyed the same way
[providers.fireworks]
api_key = "fw_YourSecretKey"

# Powers mcp.toml's [[servers]] entries, keyed by server id — merges into
# that server's env (stdio) or headers (HTTP)
[mcp.context7]
CONTEXT7_API_KEY = "ctx7sk-..."
```

## The rule

**If it's a secret, it lives here. If it's not, it doesn't.** `base_url`, server
addresses, model names — all of that stays put in `models.toml`/`mcp.toml`/`settings.toml`.
Only the sensitive half moves.

This means you can commit, share, or `cat` your other config files without a second thought — no
regex-grepping for stray keys before you paste a config into a support thread.

## Why bother?

Because "which of these four files has my Brave key in it again?" is not a question you should
have to ask. One file, one job: hold the things you'd rather not lose to a `git add .`.

Missing a section? Kaja just skips that feature — same as an omitted section anywhere else. The
template ships with every section commented out, so nothing in a fresh `secrets.toml` is a secret.

---

Next:

[Voice](/configuration/voice){: .btn .btn-green .fs-5 }
