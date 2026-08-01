# @kaja/cli

Terminal chat with personas, tools, optional mic dictation, optional TTS, MCP, and Telegram.

This package uses Bun. Entry point is **`cli.tsx`** at the package root (not `src/`).

## Commands

```bash
bun start                 # from apps/cli
bun test                  # package tests
# From monorepo root:
bun run --filter @kaja/cli start
bun run --filter @kaja/cli test
```

From monorepo root you can also run `bun dev:cli`.

## CLI surface

- Flags: `--wizard`, `--config`, `--config-dir`, `-c`/`--continue`, `-s`/`--session <id>`
- Subcommands (run **before** LLM config guard): `memory`, `session`, `telegram`, plus web UI helpers
- Handlers: `lib/memory-cli.ts`, `lib/session-cli.ts`, `lib/telegram-cli.ts`, `lib/web-cli.ts`

## Layout

```
cli.tsx                 # entry
components/             # Ink UI (layout, inputs, timeline, wizard, …)
hooks/                  # agent, settings, voice, dictation, sounds, …
lib/                    # agents, config, models, personas, MCP, telegram, tools glue, …
schemas/                # Zod for config, personas, models, sessions, MCP, datasets
tools/                  # LLM tools (files, web, memory, image, summarize, …)
locales/                # en.toml, hu.toml
assets/                 # sounds, datasets
tests/                  # mirrors source tree
```

### Shared monorepo docs

Default config **templates** (first-run / wizard) live at **repo root** `docs/config/`:

- `docs/config/config.json`
- `docs/config/models.fireworks.toml`, `models.ollama.toml`
- `docs/config/mcp.toml`
- `docs/config/personas/*.toml`
- `docs/config/datasets/`

CLI source imports them as `../../../docs/config/...` from `lib/` and `components/`.  
GitHub Pages content is also under monorepo `docs/`.

## Conventions

### Always

- Fetch current docs for dependency versions (Context7) when using libraries
- Run lint before commit (monorepo `bun lint` or package biome if configured)
- User-facing strings go through `t()` from `lib/i18n` with keys in **both** `locales/en.toml` and `locales/hu.toml`
- Write short, explicit TSDoc on non-obvious exports

### Ask first

- Ambiguous product behavior
- Refactors with many call sites
- Any git mutation
- New tools, personas, or provider presets

### Never

- Ship feature expansions without discussion
- Commit real API keys or bot tokens

### Code style

- Biome formatting (double quotes, etc. via monorepo config)
- Prefer small focused modules under `lib/`
- Dangerous shell commands: gate via `lib/command-risk.ts` / confirm UX

### Testing

- Tests under `tests/`, mirroring `components/`, `lib/`, `schemas/`, `tools/`
- Shared helpers: `tests/test-utils.tsx`
## Git

- This monorepo may use feature branches (e.g. `barkochba`); do not assume everything lands on `main` without checking
