---
layout: page
title: Configuration
nav_order: 4
---

# Configuration
Everything lives in `~/.config/kaja/`. Run `kaja --config` to print the path to `config.json`.
Templates ship in [`docs/config/`](https://github.com/SubZtep/kaja/tree/main/docs/config).

```
~/.config/kaja/
├── config.json
├── models.toml
├── mcp.toml
├── services.toml
├── personas/*.toml
└── tools/*.ts
```

See the dedicated pages for each option:

- [Config JSON](configuration/config.md)
- [Models TOML](configuration/models.md)
- [Services TOML](configuration/services.md)
- [Voice / TTS & STT](configuration/voice.md)
