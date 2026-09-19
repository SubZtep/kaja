# @kaja/tui

Terminal chat with personas, tools, optional mic dictation, optional TTS, MCP, and Telegram.

This package uses Bun. Entry point is **`cli.ts`** at the package root (not `src/`). **With no `--local`/`--cloud` flag, the mode auto-detects**: local if a config already exists (`~/.config/kaja/settings.toml`), cloud login otherwise. `--local` forces the local-agent path; `--cloud` forces cloud login even if a local config exists. Cloud mode: no local agent, no sqlite, no MCP, no shell tools, talks to `<apiUrl>/nasi/*` over SSE. `read_file`/`list_files` are the exception: the server still can't touch the user's disk, so when the model calls either, `Nasi` pauses the turn (`client_tool_call`/`needs_client_tool`, mirroring the `ask_user`/`confirm_command` pause pattern) and `use-cloud-agent.ts` runs the real tool locally (scoped to `process.cwd()` via `setToolDeps` in `run-cloud.tsx`) before resuming — transparent to the user, no confirmation, same as local mode. Auth: device login on first run (single bearer token stored in the OS credential store via `Bun.secrets`, keyed by `service: "kaja-tui"` / `name: "token"`; no on-disk credentials file; if the OS keychain is unavailable, the CLI errors out and recommends `--local`). Only one cloud account can be signed in at a time; `kaja logout` clears it. Server-side persona catalog (admin-managed, `apps/api`'s `persona` table) drives both `switch_persona` (model-invoked, mid-conversation) and the user-facing persona picker (default hotkey Alt+P) in cloud mode. Local mode: agent logic lives in `@kaja/nasi`, this app is the local host + Ink UI, requires a configured `models.toml` (own provider — no silent fallback to cloud free chat). `lib/auth/` (device-login, credentials), `hooks/use-cloud-agent.ts`, and `subcommands/run-cloud.tsx` are cloud-only; `components/layout/app.tsx` is the single TUI for both backends — `App` dispatches on a `mode: "local" | "cloud"` prop to a thin `LocalApp`/`CloudApp` wrapper (each driving `useAgent`/`useCloudAgent`), both rendering the same shared `Header`/`ChatViewport`/`UserInput`/`PersonaPicker` chrome (`run_command` confirm is `--local`-only — cloud Nasi never emits it). There is no `/` slash-command menu — thinking/sounds/voice are read once from `settings.toml` at startup and not toggleable in-app (edit the file and restart). A key bar (`components/layout/key-bar.tsx`) is pinned to the bottom of the screen, showing Esc (context-aware: Quit while typing, Cancel/Decline instead while the persona picker/confirm-command prompt is showing over the input, nothing while a command is actually running — computed from `bottomChromeKey` in `app.tsx`), `<modifier>`+L (help URL), `<modifier>`+P (persona picker, when available), and `<modifier>`+R (copy the most recent message — `chat-viewport.tsx`'s own `useInput`, taking the same `hotkeyModifier` prop, not "C": plain `Ctrl+C` is reserved globally by Ink to quit the app, checked before any `useInput` handler runs, so that letter can never be bound to anything else under either modifier). Help+Persona are bound via `hooks/use-modifier-keys.ts` (`key.meta`/`key.ctrl`, plain Ink `useInput`) — the same mechanism as this app's pre-existing Alt+Enter (newline, unaffected by `hotkeyModifier` — a separate binding in `text-input.tsx`), which `text-input.tsx`'s `mutateTextForKey` explicitly excludes from ever being inserted as typed text. Help uses "L", not the more obvious "H": Ctrl+H is byte-identical to Backspace (0x08), so it could never fire under `hotkeyModifier: "ctrl"` — Ink has no way to distinguish them. The modifier is `preferences.hotkeyModifier` in settings.toml (`"alt"` default or `"ctrl"`), because no choice is universal in a terminal: Alt can type special characters instead of acting as a modifier on some macOS terminals (Terminal.app/iTerm2 without "Option as Meta" enabled), Ctrl+<letter> can collide with host-app global shortcuts (e.g. VS Code's integrated terminal reserves several of them regardless of which panel has focus). F-keys and Ctrl+<digit> were tried first and dropped entirely: Ink's public `Key` type has no F-key support at all (raw escape-sequence matching was needed and still wasn't reliable across terminals), and Ctrl+<digit> isn't reliably sent as a byte by several terminals either. The app never writes to `~/.config/kaja/*.toml` at runtime — only first-run setup and the explicit `kaja config wizard`/`kaja config fetch` subcommands do (the latter backs up the previous file as `.bak`/`.bak2`/… via `lib/config/fetch.ts`'s `writeTemplateConfig` before overwriting). A manually picked persona is session-only in both modes — it always starts from the default persona on the next launch.

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

- Flags: `--local`, `--cloud`, `--headless`, `-c`/`--continue` (`--local` only), `-s`/`--session <id>` (`--local` only)
- Subcommands, `--local` only (run **before** LLM config guard): `telegram`
- `logout` and `config <fetch|paths>` run before the cloud/local mode branch — `logout` is a cloud-only concept (clears the keychain token), `config` only ever touches local files and must never trigger cloud login
- `pkg [update]` runs there too, for the same reason as `config`: `kaja pkg update` (`lib/packages/cli.ts`) sparse-checks-out the source repo's `marketplace/` folder into a cache (`lib/packages/fetch.ts`, needs `git`) and syncs it into `~/.config/kaja/marketplace/` (`lib/packages/sync.ts`: a `.sync-lock.json` of hashes tells untouched copies from your edits; edited files are backed up as `.bak`/`.bak2` before upstream replaces them; files you added are never touched). A cloud user (same mode rule as `cli.ts`: `--cloud`, or no configured local chat model without `--local`) only gets a pointer to https://kaja.io/packages. Bare `kaja pkg` runs that once if never synced, then shows `components/package-picker.tsx` and writes `packages.toml`. Nothing else touches the network for packages — startup only reads the folder.
- `doctor` (`subcommands/doctor.ts`, `--local` only): first a keys-and-tokens pass (`lib/doctor/credentials.ts` collects what the config relies on, `lib/doctor/checks.ts` tests each live, `resolveCredentials` asks for missing/failing ones through `lib/doctor/prompt.tsx` when stdin is a TTY, tests before saving via `saveSecrets`), then the models/MCP/tools report, then a summary of what's left in secrets.toml. Non-TTY: report only.
- Handlers: `lib/telegram/cli.ts`
- `--headless`: no Ink render, for a subcommand that supports it. `telegram` is the only consumer today (`kaja --local --headless telegram`) — it never rendered Ink to begin with, so this just formalizes it and shares its bootstrap (`lib/cli/headless.ts`'s `bootstrapLocalAgentDeps`/`requireConfiguredProvider`/`installShutdownHandlers`) with the interactive local loop (`subcommands/run.tsx`). Bare `kaja --headless` (no subcommand) exits with an error — there's no headless mode without a consumer yet. Cloud-mode headless (a driver against `createNasiClient`'s SSE stream instead of the local `Agent`) doesn't exist yet.
- First run under `--local` (no `settings.toml` yet, interactive TTY only): `components/first-run-setup.tsx` asks which provider template to start from. Optionally copies `models.fireworks.toml`/`models.ollama.toml` as a starting `models.toml`; "Skip" writes neither, and `subcommands/run.tsx` then exits with an error instead of silently falling back to cloud free chat (`isFreeChat` in `lib/models/openai.ts` — still used internally by `chatModel` resolution, just no longer a reachable default). Non-interactive stdin falls back to writing the template untouched, same as before this prompt existed. Dispatch glue for all of this lives in `lib/cli/` (`args.ts`, `bootstrap.ts`, `first-run.tsx`).
- First run under cloud mode (no `settings.toml` yet): `lib/config/config.ts`'s `createCloud()` writes a minimal file with just `[preferences]` `locale` (detected from the system locale, else `en-GB`) — no `persona` (a local-agent concept) and no `stt`/`tts`/`memory` sections. There's no `--lang` flag; language always comes from this file, set once at startup by `lib/cli/bootstrap.ts`'s `detectAndSetLanguage`.

## Layout

```
cli.ts                  # entry
components/             # Ink UI (layout, inputs, timeline, wizard, …)
hooks/                  # agent, settings, voice, dictation, sounds, …
lib/                    # domain subfolders: cli, agent, auth, config, models, personas, memory, packages,
                        # session, telegram, audio, mcp, image, markdown; cross-cutting utils at lib/ root
subcommands/            # run.tsx (--local), run-cloud.tsx (cloud)
tools/                  # LLM tools (files, web, memory, image, summarize, …)
locales/                # en-GB.toml, hu-HU.toml, nan-TW.toml
assets/                 # sounds, datasets
tests/                  # mirrors source tree
```

Skills (local mode): `~/.config/kaja/marketplace/skills/<name>/` holds every skill (synced or your own), and only names listed in `~/.config/kaja/packages.toml` load. `tools/index.ts`'s `getDefaultTools` builds `@kaja/nasi`'s folder store from `lib/packages/packages-file.ts` and appends `load_skill`, so the TUI and local Telegram both get it. HTTP tool packages (`marketplace/tools/<name>.toml`, listed in packages.toml's `tools`) load the same way, with their key from secrets.toml's `[packages.<name>]` and private hosts allowed; a non-GET one pauses with `confirm_tool`, shown by the same `ConfirmCommand` gate (`kind: "tool"`) and resolved by `use-agent.ts`'s `resolveToolApproval` (local Telegram: a `tool:approve|decline` callback). MCP packages (`marketplace/mcp/<name>.toml`, packages.toml's `mcp`) are handed to `createTools` as `mcpPackages` and connect alongside mcp.toml servers; `kaja pkg` confirms a stdio one's command before enabling it. A missing packages.toml means nothing is enabled, and it is never auto-created.

Zod schemas for this app's config/store/domain types live in `@kaja/schema/config`, `@kaja/schema/store`, `@kaja/schema/cli` (see `packages/schema/AGENTS.md`), not under this package.

### Shared monorepo docs

Default config **templates** (first-run / wizard) live at **repo root** `docs/config/`:

- `docs/config/settings.toml`
- `docs/config/models.fireworks.toml`, `models.ollama.toml`
- `docs/config/mcp.toml`
- `docs/config/personas/*.toml`
- `docs/config/datasets/`
- `docs/config/packages.toml`

CLI source imports them as `../../../../docs/config/...` from `lib/<domain>/*.ts`.  
GitHub Pages content is also under monorepo `docs/`.

## Conventions

### Always

- Fetch current docs for dependency versions (Context7) when using libraries
- Run lint before commit (monorepo `bun lint` or package biome if configured)
- User-facing strings go through `t()` from `lib/i18n.ts` with keys in **all three** of `locales/en-GB.toml`, `locales/hu-HU.toml`, and `locales/nan-TW.toml`
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
