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

- Flags: `--config <dir>`, `--paths`, `-c`/`--continue`, `-s`/`--session <id>`
- Subcommands (run **before** LLM config guard): `memory`, `session`, `telegram`, plus web UI helpers
- Handlers: `lib/memory/cli.ts`, `lib/session/cli.ts`, `lib/telegram/cli.ts`, `lib/web/cli.ts`
- First run (no `settings.toml` yet, interactive TTY only): `components/first-run-setup.tsx` asks free hosted chat vs. own provider. Free hosted chat omits `models.chat` entirely; `lib/models/openai.ts` treats a missing `models.chat` as the free tier and resolves it directly (base URL `https://openai.kaja.io`, api key `"kaja"`) without touching `models.toml`. If `services.toml` has `[zen].apiKey` set, that key is forwarded to the proxy via the `x-kaja-zen-key` header and used upstream instead of the proxy's DB-sourced provider key (see `apps/openai/index.ts`). Own provider optionally copies `models.fireworks.toml`/`models.ollama.toml` as a starting `models.toml`. Non-interactive stdin falls back to writing the template untouched, same as before this prompt existed. Dispatch glue for all of this lives in `lib/cli/` (`args.ts`, `bootstrap.ts`, `dispatch.ts`, `first-run.tsx`).

## Layout

```
cli.tsx                 # entry
components/             # Ink UI (layout, inputs, timeline, wizard, …)
hooks/                  # agent, settings, voice, dictation, sounds, …
lib/                    # domain subfolders: cli, agent, config, models, personas, memory,
                        # session, telegram, audio, mcp, web; cross-cutting utils at lib/ root
tools/                  # LLM tools (files, web, memory, image, summarize, …)
locales/                # en.toml, hu.toml
assets/                 # sounds, datasets
tests/                  # mirrors source tree
```

Zod schemas for this app's config/store/domain types live in `@kaja/schema/config`, `@kaja/schema/store`, `@kaja/schema/cli` (see `packages/schema/AGENTS.md`), not under this package.

### Shared monorepo docs

Default config **templates** (first-run / wizard) live at **repo root** `docs/config/`:

- `docs/config/settings.toml`
- `docs/config/models.fireworks.toml`, `models.ollama.toml`
- `docs/config/mcp.toml`
- `docs/config/personas/*.toml`
- `docs/config/datasets/`

CLI source imports them as `../../../../docs/config/...` from `lib/<domain>/*.ts`.  
GitHub Pages content is also under monorepo `docs/`.

## Conventions

### Always

- Fetch current docs for dependency versions (Context7) when using libraries
- Run lint before commit (monorepo `bun lint` or package biome if configured)
- User-facing strings go through `t()` from `lib/i18n.ts` with keys in **both** `locales/en.toml` and `locales/hu.toml`
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
- Prefer small focused modules under `lib/`, grouped into the domain subfolder they belong to
- Dangerous shell commands: gate via `lib/agent/command-risk.ts` / confirm UX

### Testing

- Tests under `tests/`, mirroring `components/`, `lib/`, `tools/`
- Shared helpers: `tests/test-utils.tsx`
## Git

- This monorepo may use feature branches (e.g. `barkochba`); do not assume everything lands on `main` without checking
