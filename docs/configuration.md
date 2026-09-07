---
layout: page
title: Configuration
nav_order: 3
---

# Configuration

LLM provider credentials, model mapping to tasks, secrets, services, and various settings are in `~/.config/kaja`. Including [`personas`](config/personas/) with [`datasets`](config/datasets/).

First  fetches the templates from [`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config).

Install recommended VSCode extensions for TOML [`schemas`](config/schemas/).

```ini
~/.config/kaja/
├─ datasets/*.json  # custom fields for personas to collect
├─ personas/*.toml  # one behaviour per file
├─ mcp.toml         # model context protocol servers
├─ models.toml      # model catalog per provider
├─ services.toml    # external service definitions and endpoints
├─ secrets.toml     # user’s secret keys and tokens
└─ settings.toml    # optional settings and app preferences"
```

---

Next:

[Config](/configuration/config){: .btn .btn-green .fs-5 }
