---
layout: page
title: Configuration
nav_order: 3
---

# Configuration

LLM provider credentials, model mapping to tasks, secrets, services, and various settings are in `~/.config/kaja`. Including [`personas`](config/personas/) with [`datasets`](config/datasets/).

First  fetches the templates from [`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config).

Install recommended VSCode extensions for TOML [`schemas`](config/schemas/).

```
~/.config/kaja/
├── settings.toml
├── models.toml
├── mcp.toml
├── services.toml
├── secrets.toml      # every credential, all in one place
├── personas/*.toml
└── tools/*.ts
```

---

Next:

[Config](/configuration/config){: .btn .btn-green .fs-5 }
