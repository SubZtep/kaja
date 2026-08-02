# @kaja/cli

Terminal chat with personas, tools, optional mic dictation, optional TTS, MCP, and Telegram.

This package uses Bun. Entry point is **`cli.tsx`** at the package root (not `src/`).

## Commands

```bash
bun start                 # from apps/cli
bun test                  # package tests
# From monorepo root:
bun dev:cli               # interactive — attaches your real TTY, use this one
bun run --filter @kaja/cli test
```

`bun run --filter @kaja/cli start` also works but runs through Bun's workspace script
runner, which does not pass your terminal's TTY through to the child process — Ink then
sees `process.stdin.isTTY` as falsy (skips the first-run prompt, and the main app crashes
with "Raw mode is not supported"). Always use `bun dev:cli` (or `cd apps/cli && bun run
cli.tsx` directly) for interactive use.

## CLI surface

- Flags: `--config`, `--config-dir`, `-c`/`--continue`, `-s`/`--session <id>`
- Subcommands (run **before** LLM config guard): `memory`, `session`, `telegram`, plus web UI helpers
- Handlers: `lib/memory-cli.ts`, `lib/session-cli.ts`, `lib/telegram-cli.ts`, `lib/web-cli.ts`
- First run (no `config.json` yet, interactive TTY only): `components/first-run-setup.tsx` asks free hosted chat vs. own provider. Free hosted chat sets `models.chat` to the sentinel `kaja-free-chat`, resolved directly in `lib/openai.ts` (base URL `https://openai.kaja.io`, api key `"kaja"`) without touching `models.toml`. Own provider optionally copies `models.fireworks.toml`/`models.ollama.toml` as a starting `models.toml`. Non-interactive stdin falls back to writing the template untouched, same as before this prompt existed.

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
