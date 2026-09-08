---
layout: page
title: Services
parent: Configuration
nav_order: 4.3
---

# services.toml

Optional external services. Omit a section to leave that feature off. Credentials for these same
sections live in [`secrets.toml`](/configuration/secrets) — this file only holds the non-secret
half (URLs, ids, flags).

```toml
# The Kaja server this install talks to.
[api]
baseUrl = "https://api.kaja.io"

# Geo lookup (IP → city/country), folded into the system prompt.
[location]
serviceUrl = "https://ip2geo.demo.land"

# Telegram bot — see the Telegram page. allowedUserIds gates who the bot
# will respond to and must be non-empty.
# [telegram]
# allowedUserIds = [123456789]
```

| Section | Enables |
| --- | --- |
| `[api]` | the Kaja server this install points at |
| `[location]` | approximate location in the system prompt, so "what's the weather" needs no city |
| `[telegram]` | the [Telegram bot](/telegram) |
| `[webSearch]` | the `web_search` tool — no non-secret fields, so it only appears in `secrets.toml` |

`[location]` is *not* a tool the model calls: Kaja resolves your public IP once and writes the
result (city, country, timezone, coordinates) into the system prompt as a default for
location-sensitive questions. A separate `location` MCP server against the same host ships enabled
in [`mcp.toml`](/tools#mcp-servers) if you want the model to look things up itself.

`[api].baseUrl` can be overridden for a single run with the `KAJA_API_URL` environment variable —
handy for pointing at a local dev API without editing the file. Hosted mode reads that same
variable, defaulting to `https://api.kaja.io`.

This file is safe to share, commit to a dotfiles repo, or paste into a bug report — no keys live
here.

### Where to get credentials

- **Web search** (`[webSearch]`): a free key from [Brave Search API](https://brave.com/search/api/).
- **Location** (`[location]`): the shipped demo URL and key work out of the box.

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
