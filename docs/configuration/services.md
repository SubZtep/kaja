---
layout: page
title: Services
parent: Configuration
nav_order: 3.3
---

# Services

s`ervices.toml` has optional external service configuration. Omit a section to disable the related feature.

Examples:

```toml
# Kaja server used by `kaja config fetch` to regenerate mcp.toml/models.toml.
# `token` is the API CONFIG_API_TOKEN (Bearer); can also be set via the
# CONFIG_API_TOKEN env var instead.
[api]
baseUrl = "https://api.kaja.io"
token = "kaja"

# Geo lookup for the location tool (IP → city/country).
[location]
serviceUrl = "https://ip2geo.demo.land/"
apiKey = "kaja"

# Brave Search API key for the web_search tool.
[webSearch]
apiKey = "BSA..."

# Telegram bot — see the Telegram page.
[telegram]
botToken = "123456:ABC-DEF..."
allowedUserIds = [123456789]

# OpenCode Zen free models — see https://opencode.ai/zen.
[zen]
apiKey = "sk-..."
```

Notes:

- Credentials and keys are stored here so multiple local config profiles can reuse providers.
- Keep `services.toml` secure and do not commit real keys to version control.

### Where to get credentials?

- **Web search** (`[webSearch]`): get a free key from [Brave's website](https://brave.com/search/api/).
- **Location** (`[location]`): the example URL and API key work for a while.
- **Zen** (`[zen]`): get a free API key from [OpenCode Zen](https://opencode.ai/zen).
