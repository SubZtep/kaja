---
layout: page
title: Services
parent: Configuration
nav_order: 3.3
---

# Services

`services.toml` has optional external service configuration. Omit a section to disable the
related feature. Credentials for these same sections live in [`secrets.toml`](/configuration/secrets)
instead — this file only holds the non-secret bits (URLs, ids, flags).

Examples:

```toml
# Kaja server used by `kaja config fetch` to regenerate mcp.toml/models.toml.
[api]
baseUrl = "https://api.kaja.io"

# Geo lookup for the location tool (IP → city/country).
[location]
serviceUrl = "https://ip2geo.demo.land/"

# Telegram bot — see the Telegram page. allowedUserIds gates who the bot
# will respond to and must be non-empty.
[telegram]
allowedUserIds = [123456789]
```

`[webSearch]` and `[zen]` have no non-secret fields of their own — turning them on is just adding
their section to `secrets.toml` (see the Secrets page).

Notes:

- This file is safe to share, commit to a dotfiles repo, or paste into a bug report — no keys live
  here anymore.

### Where to get credentials?

- **Web search** (`[webSearch]`): get a free key from [Brave's website](https://brave.com/search/api/).
- **Location** (`[location]`): the example URL and API key work for a while.
- **Zen** (`[zen]`): get a free API key from [OpenCode Zen](https://opencode.ai/zen).

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
