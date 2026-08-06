---
layout: page
title: Configuration
nav_order: 3
---

# Configuration

Everything lives in `~/.config/kaja/`. Run `kaja --paths` to print every path Kaja uses.
Templates ship in [`docs/config/`](https://github.com/SubZtep/kaja/tree/main/docs/config).

```
~/.config/kaja/
├── settings.json
├── models.toml
├── mcp.toml
├── services.toml
├── personas/*.toml
└── tools/*.ts
```

See the dedicated pages for each option:

- [Config](configuration/config.md)
- [Models](configuration/models.md)
- [Services](configuration/services.md)
- [Voice / TTS & STT](configuration/voice.md)

## `kaja config fetch`

Downloads `mcp.toml` and `models.toml` from a Kaja server, backing up any existing files first:

```sh
kaja config fetch
```

Set `services.toml`'s `[api]` `baseUrl` (and `token` if required) before running this.
On a fresh install, the fetched `models.toml`'s first `chat`-task model is also auto-filled into
`settings.json`'s `models.chat`, so a single fetch is enough to leave a fresh install bootable (a
chat model you've deliberately chosen is never overwritten by a later fetch).

## `kaja config wipe`

Backs up the whole config directory (`settings.json`, `models.toml`, `mcp.toml`, `services.toml`,
`tools/`, `personas/`, `datasets/`) by renaming it to `<dir>.bak` (or `.bak2`, `.bak3`, ... if
backups already exist), leaving a clean slate for the next run of `kaja` to recreate:

```sh
kaja config wipe
```

Nothing is ever deleted — recover by renaming the `.bak` directory back if needed.
