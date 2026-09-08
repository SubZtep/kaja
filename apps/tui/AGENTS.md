# @kaja/tui

Terminal chat with personas, tools, optional mic dictation, optional TTS, MCP, and Telegram.

This package uses Bun. Entry point is **`cli.ts`** at the package root (not `src/`). **With no `--local`/`--remote` flag, the mode auto-detects**: local if a config already exists (`~/.config/kaja/settings.toml`), hosted login otherwise. `--local` forces the local-agent path; `--remote` forces hosted login even if a local config exists. Hosted mode: no local agent, no sqlite, no MCP, no shell tools, talks to `<apiUrl>/nasi/*` over SSE. Auth: device login on first run (single bearer token stored in the OS credential store via `Bun.secrets`, keyed by `service: "kaja-tui"` / `name: "token"`; no on-disk credentials file; if the OS keychain is unavailable, the CLI errors out and recommends `--local`). Only one hosted account can be signed in at a time; `kaja logout` clears it. Server-side persona catalog (admin-managed, `apps/api`'s `persona` table) drives `switch_persona` in hosted mode. Local mode: agent logic lives in `@kaja/nasi`, this app is the local host + Ink UI, requires a configured `models.toml` (own provider — no silent fallback to hosted free chat). `lib/auth/` (device-login, credentials), `hooks/use-remote-agent.ts`, and `subcommands/run-remote.tsx` are hosted-only; `components/layout/lite-app.tsx` reuses `Header`/`ChatViewport`/`UserInput` from the full TUI (persona/model switching and `run_command` confirm are `--local`-only — hosted Nasi never emits those).

## Commands

```bash
bun start                 # from apps/tui
bun test                  # package tests
# From monorepo root:
bun dev:tui               # interactive — attaches your real TTY, use this one
bun run --filter @kaja/tui test
```

`bun run --filter @kaja/tui start` also works but runs through Bun's workspace script
runner, which does not pass your terminal's TTY through to the child process — Ink then
sees `process.stdin.isTTY` as falsy (skips the first-run prompt, and the main app crashes
with "Raw mode is not supported"). Always use `bun dev:tui` (or `cd apps/tui && bun run
cli.ts` directly) for interactive use.

## CLI surface

- Flags: `--local`, `--remote`, `--headless`, `-c`/`--continue` (`--local` only), `-s`/`--session <id>` (`--local` only)
- Subcommands, `--local` only (run **before** LLM config guard): `telegram`, `config <fetch|wipe|paths>`
- `logout` runs before the mode branch (hosted-only concept, clears the keychain token)
- Handlers: `lib/telegram/cli.ts`
- `--headless`: no Ink render, for a subcommand that supports it. `telegram` is the only consumer today (`kaja --local --headless telegram`) — it never rendered Ink to begin with, so this just formalizes it and shares its bootstrap (`lib/cli/headless.ts`'s `bootstrapLocalAgentDeps`/`requireConfiguredProvider`/`installShutdownHandlers`) with the interactive local loop (`subcommands/run.tsx`). Bare `kaja --headless` (no subcommand) exits with an error — there's no headless mode without a consumer yet. Hosted-mode headless (a driver against `createNasiClient`'s SSE stream instead of the local `Agent`) doesn't exist yet.
- First run under `--local` (no `settings.toml` yet, interactive TTY only): `components/first-run-setup.tsx` asks which provider template to start from. Optionally copies `models.fireworks.toml`/`models.ollama.toml` as a starting `models.toml`; "Skip" writes neither, and `subcommands/run.tsx` then exits with an error instead of silently falling back to hosted free chat (`isFreeChat` in `lib/models/openai.ts` — still used internally by `chatModel` resolution, just no longer a reachable default). Non-interactive stdin falls back to writing the template untouched, same as before this prompt existed. Dispatch glue for all of this lives in `lib/cli/` (`args.ts`, `bootstrap.ts`, `first-run.tsx`).
- First run under hosted mode (no `settings.toml` yet): `lib/config/config.ts`'s `createRemote()` writes a minimal file with just `[preferences]` `language` (detected from the system locale, else `en-GB`) — no `persona` (a local-agent concept) and no `stt`/`tts`/`memory` sections. There's no `--lang` flag; language always comes from this file, set once at startup by `lib/cli/bootstrap.ts`'s `detectAndSetLanguage`.

## Layout

```
cli.ts                  # entry
components/             # Ink UI (layout, inputs, timeline, wizard, …)
hooks/                  # agent, settings, voice, dictation, sounds, …
lib/                    # domain subfolders: cli, agent, auth, config, models, personas, memory,
                        # session, telegram, audio, mcp, image, markdown; cross-cutting utils at lib/ root
subcommands/            # run.tsx (--local), run-remote.tsx (hosted)
tools/                  # LLM tools (files, web, memory, image, summarize, …)
locales/                # en.toml, hu.toml, nan-TW.toml
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
- User-facing strings go through `t()` from `lib/i18n.ts` with keys in **all three** of `locales/en-GB.toml`, `locales/hu.toml`, and `locales/nan-TW.toml`
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
