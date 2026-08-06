---
layout: page
title: Services
parent: Configuration
nav_order: 4.3
---

# Services

s`ervices.toml` has optional external service configuration. Omit a section to disable the related feature.

Examples:

```toml
# Base URL of a Kaja server, used by `kaja config fetch`.
[api]
baseUrl = "https://api.kaja.io"

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
```

Notes:

- Credentials and keys are stored here so multiple local config profiles can reuse providers.
- Keep `services.toml` secure and do not commit real keys to version control.
