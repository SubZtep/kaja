# @kaja/tui

Terminal chat with personas, tools, optional mic dictation, optional TTS, MCP, and Telegram.

This package uses Bun. Entry point is **`cli.ts`** at the package root (not `src/`). **With no `--local`/`--cloud` flag, the mode comes from `preferences.mode` in `~/.config/kaja/settings.toml`** (see `lib/config/mode.ts`); with no config at all, the setup wizard asks. `--local` forces the local-agent path; `--cloud` forces cloud login even if a local config exists. Cloud mode: no local agent, no sqlite, no MCP, no shell tools, talks to `<apiUrl>/nasi/*` over SSE. `read_file`/`list_files` are the exception: the server still can't touch the user's disk, so when the model calls either, `Nasi` pauses the turn (`client_tool_call`/`needs_client_tool`, mirroring the `ask_user`/`confirm_command` pause pattern) and `use-cloud-agent.ts` runs the real tool locally (scoped to `process.cwd()` via `setToolDeps` in `run-cloud.tsx`) before resuming — transparent to the user, no confirmation, same as local mode. Auth: device login on first run (single bearer token stored in the OS credential store via `Bun.secrets`, keyed by `service: "kaja-tui"` / `name: "token"`; no on-disk credentials file; if the OS keychain is unavailable, the CLI errors out and recommends `--local`). Only one cloud account can be signed in at a time; `kaja logout` clears it. The user's cloud personas (marketplace abilities they turned on, plus `default`) drive both `switch_persona` (model-invoked, mid-conversation; `use-cloud-agent.ts` follows the `persona_switch` event) and the user-facing persona picker (default hotkey Alt+P) in cloud mode. Local mode: agent logic lives in `@kaja/nasi`, this app is the local host + Ink UI, requires a configured `models.toml` (own provider — no silent fallback to cloud free chat). `lib/auth/` (device-login, credentials), `hooks/use-cloud-agent.ts`, and `subcommands/run-cloud.tsx` are cloud-only; `components/layout/app.tsx` is the single TUI for both backends — `App` dispatches on a `mode: "local" | "cloud"` prop to a thin `LocalApp`/`CloudApp` wrapper (each driving `useAgent`/`useCloudAgent`), both rendering the same shared `Header`/`ChatViewport`/`UserInput`/`PersonaPicker` chrome (`run_command` confirm is `--local`-only — cloud Nasi never emits it). There is no `/` slash-command menu — thinking/sounds/voice are read once from `settings.toml` at startup and not toggleable in-app (edit the file and restart). A key bar (`components/layout/key-bar.tsx`) is pinned to the bottom of the screen, showing Esc (context-aware: Quit while typing, Cancel/Decline instead while the persona picker/confirm-command prompt is showing over the input, nothing while a command is actually running — computed from `bottomChromeKey` in `app.tsx`), `<modifier>`+L (help URL), `<modifier>`+P (persona picker, when available), and `<modifier>`+R (copy the most recent message — `chat-viewport.tsx`'s own `useInput`, taking the same `hotkeyModifier` prop, not "C": plain `Ctrl+C` is reserved globally by Ink to quit the app, checked before any `useInput` handler runs, so that letter can never be bound to anything else under either modifier). Help+Persona are bound via `hooks/use-modifier-keys.ts` (`key.meta`/`key.ctrl`, plain Ink `useInput`) — the same mechanism as this app's pre-existing Alt+Enter (newline, unaffected by `hotkeyModifier` — a separate binding in `text-input.tsx`), which `text-input.tsx`'s `mutateTextForKey` explicitly excludes from ever being inserted as typed text. Help uses "L", not the more obvious "H": Ctrl+H is byte-identical to Backspace (0x08), so it could never fire under `hotkeyModifier: "ctrl"` — Ink has no way to distinguish them. The modifier is `preferences.hotkeyModifier` in settings.toml (`"alt"` default or `"ctrl"`), because no choice is universal in a terminal: Alt can type special characters instead of acting as a modifier on some macOS terminals (Terminal.app/iTerm2 without "Option as Meta" enabled), Ctrl+<letter> can collide with host-app global shortcuts (e.g. VS Code's integrated terminal reserves several of them regardless of which panel has focus). F-keys and Ctrl+<digit> were tried first and dropped entirely: Ink's public `Key` type has no F-key support at all (raw escape-sequence matching was needed and still wasn't reliable across terminals), and Ctrl+<digit> isn't reliably sent as a byte by several terminals either. The app never writes to `~/.config/kaja/*.toml` at runtime — only first-run setup and the explicit `kaja config wizard`/`kaja config fetch` subcommands do (the latter backs up the previous file as `.bak`/`.bak2`/… via `lib/config/fetch.ts`'s `writeTemplateConfig` before overwriting). A manually picked persona is session-only in both modes — it always starts from the default persona on the next launch.

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
sees `process.stdin.isTTY` as falsy (skips the setup wizard, and the main app crashes
with "Raw mode is not supported"). Always use `bun dev:tui` (or `cd apps/tui && bun run
cli.ts` directly) for interactive use.

## CLI surface

- Flags: `--local`, `--cloud`, `--headless`, `-c`/`--continue` (`--local` only), `-s`/`--session <id>` (`--local` only)
- Subcommands, `--local` only (run **before** LLM config guard): `telegram`
- `logout` and `config <fetch|paths>` run before the cloud/local mode branch — `logout` is a cloud-only concept (clears the keychain token), `config` only ever touches local files and must never trigger cloud login
- `abilities [update]` runs there too, for the same reason as `config`: `kaja abilities update` (`lib/abilities/cli.ts`) sparse-checks-out the source repo's `marketplace/` folder into a cache (`lib/abilities/fetch.ts`, needs `git`) and syncs it into `~/.config/kaja/marketplace/` (`lib/abilities/sync.ts`: a `.sync-lock.json` of hashes tells untouched copies from your edits; edited files are backed up as `.bak`/`.bak2` before upstream replaces them; files you added are never touched). A cloud user (same mode rule as `cli.ts`: `--cloud`, or no configured local chat model without `--local`) only gets a pointer to https://kaja.io/abilities. Bare `kaja abilities` runs that once if never synced, then shows `components/ability-picker.tsx` and writes `abilities.toml`. Nothing else touches the network for abilities — startup only reads the folder.
- `doctor` (`subcommands/doctor.ts`, `--local` only): first a keys-and-tokens pass (`lib/doctor/credentials.ts` collects what the config relies on, `lib/doctor/checks.ts` tests each live, `resolveCredentials` asks for missing/failing ones through `lib/doctor/prompt.tsx` when stdin is a TTY, tests before saving via `saveSecrets`; the whole pass is `runCredentialPass`, which the setup wizard reuses. A `CheckResult` failure carries a `kind`: only `"credential"` (a 401/403 — the service saw the value and refused it) is asked about, while `"unreachable"` (a refused connection, a 404 for the model) is reported and skipped, because a local server that isn't running needs starting, not a new key — Ollama and llama.cpp take none at all. The to-do list keeps the two apart: keys point at their secrets.toml entry, unreachable services at models.toml.), then the models/MCP/tools report, then a summary of what's left in secrets.toml. Non-TTY: report only.
- Handlers: `lib/telegram/cli.ts`
- Logging: `lib/logger.ts` is an opt-in JSON-lines file log (`log.warn(message, payload?)`): silent unless both `KAJA_LOG_LEVEL` and `KAJA_LOG_FILE` are set, and never writes to the terminal (Ink owns it). `cli.ts` routes `@kaja/nasi`'s warnings there via `setWarnHandler`.
- `--headless`: no Ink render, for a subcommand that supports it. `telegram` is the only consumer today (`kaja --local --headless telegram`) — it never rendered Ink to begin with, so this just formalizes it and shares its bootstrap (`lib/cli/headless.ts`'s `bootstrapLocalAgentDeps`/`requireConfiguredProvider`/`installShutdownHandlers`) with the interactive local loop (`subcommands/run.tsx`). Bare `kaja --headless` (no subcommand) exits with an error — there's no headless mode without a consumer yet. Cloud-mode headless (a driver against `createNasiClient`'s SSE stream instead of the local `Agent`) doesn't exist yet.
- First run (no `settings.toml` yet, interactive TTY only): `components/config-wizard.tsx` — the same wizard `kaja config wizard` re-runs, so there is one setup flow, not two. Steps are language → mode → provider → provider key → server address → extras → each ticked extra's follow-up → summary; a step is skipped when it can't apply (cloud needs no provider, and only a provider that runs on this machine — Ollama, llama.cpp — is asked for an address), and `--cloud`/`--local` skip the mode step. Language is first and never skipped, because every question after it is only answerable by someone who can read it; picking one calls `setLanguage` straight away, so the rest of the wizard renders in it (the caller still writes `preferences.locale`). A *prefilled* mode does not skip the mode step — that's the current setting being re-offered — only a forced one does, which is why `nextStepAfter` takes the forced mode rather than reading `result.mode`. **Keys are typed in the wizard but saved by the credential pass.** The wizard asks for every key its own answers imply — the provider's, and each ticked extra's (Brave, the Telegram bot token) — because asking for them a minute later, after the marketplace clone and the model downloads, was the seam that made setup feel disjointed. It only *collects* them: the component does no I/O, so nothing is tested or written there. `runCredentialPass` (`lib/doctor/credentials.ts`, shared with `kaja doctor`) still does both, so a key is never saved untested; it takes them as `offered` (`OfferedValues`, keyed by `CredentialItem.where`), where a string is tested and saved exactly as a typed one would be, and **`null` means the wizard already asked and was turned down**, so the pass reports it instead of asking a second time. In `WizardResult` that distinction is `""` (shown and skipped) versus `undefined` (never applied) — losing it would restore the double-ask. `kaja doctor` passes no `offered`, so its behaviour is unchanged. `kaja abilities` uses the same pass for the keys of what it just enabled, through `runCredentialPass`'s `scope` (`{ only, askOptional }`): it is limited to those abilities (`abilityKeyWhere`) and also asks for an optional key once, which the pass otherwise never does — so those keys are tested before they're saved, unlike the hand-rolled prompt this replaced. The pass still asks for everything only the finished config reveals: an ability's key, an MCP server's declared secret. **The summary lists each key step's fate (entered / already saved, kept / skipped) but never the value.** **No step asks about abilities either**: `applyStarterAbilities` turns on `starterSelection` (`lib/abilities/picker.tsx`) — every ability needing no key or only an optional one, **excluding stdio MCP servers**, since enabling one spawns a process and that stays behind `confirmStdioServers` in `kaja abilities`. Nothing in that set can cost anything or reach anything on this machine, so there was nothing for the step to weigh up; choosing among the rest is what `kaja abilities` is for. It only runs when abilities.toml enables nothing yet — a machine whose list the user has curated is left alone, because silently re-adding what they turned off is the one thing this can get wrong, which also means it never has to merge. The guard is tested in `tests/lib/cli/starter-abilities.test.ts` (a curated file is left byte-for-byte alone and never triggers the marketplace sync; an empty one is seeded from a pre-locked marketplace, so nothing is cloned), and `starterSelection` in `tests/lib/abilities/starter.test.ts`. Optional keys some starter abilities can use are deliberately not asked for in the wizard; `kaja abilities` offers them. `scanMarketplace`/`pickAbilities`/`confirmStdioServers`/`ensureMarketplace` live in that same module, shared with `subcommands/abilities.tsx`. The extras step (web search, voice, Telegram — a MultiSelect with nothing ticked, so one Enter skips it) is followed by one step per ticked extra, and `applyExtras` then writes their non-secret answers (Speaches' URL) and hands back both the offered keys and the items `collectCredentials` can't discover: a web search key or Telegram token that isn't saved yet leaves nothing in the config to find. There is no services.toml any more (dropped 2026-09-20): the Telegram bot's only config is its token in secrets.toml, it has no allowlist, and the API base URL is `KAJA_API_URL` or the built-in default (`lib/config/api-url.ts`). The location lookup is gone too — geolocation is the marketplace's `geo-service` MCP ability's job (keyless, on in the wizard's starter set), and the default `mcp.toml` ships no server enabled. After the extras, `offerModelDownloads` asks once whether to download the models `models.toml` names that the server hasn't got (`lib/models/pull.ts`: `/api/tags` to see what's installed, `/api/pull` streaming ndjson to fetch each). It is one question for the whole list, never one per model, because nothing about them is a choice — the config already names them. A server that 404s on `/api/tags` (llama.cpp, any cloud provider, one that isn't running) is skipped silently, so the question only appears when it can be acted on; it runs before the credential pass so the provider probe meets a model that is really there. The voice step asks for one address and writes it to `[stt]` as `ws://` and `[tts]` as `http://`, since speech-to-text uses Speaches' realtime WebSocket API and text-to-speech its HTTP one (Bun's `WebSocket` tolerates an `http://` URL, so this is about matching the documented config, not a fix). Voice config is added with `appendTomlSection` (`lib/config/toml.ts`), which appends a table instead of re-serializing, so the templates' commented-out examples survive; it never touches a table that already exists. Every step opens on the current value (`readPrefill` in `lib/cli/config-wizard.tsx` reads settings.toml, models.toml's `[models.chat].provider` and secrets.toml), so Enter throughout keeps a configured machine unchanged. Optionally copies `models.fireworks.toml`/`models.ollama.toml` as a starting `models.toml`; "Skip" writes neither. The provider step deliberately does **not** offer the admin-managed bundle from the API's `GET /config/export` — it was dropped on 2026-09-20 as meaningless to a solo user on a fresh machine. `kaja config fetch` and `kaja config diff` still use that endpoint, so it stays, and `subcommands/run.tsx` then exits with an error instead of silently falling back to cloud free chat (`isFreeChat` in `lib/models/openai.ts` — still used internally by `chatModel` resolution, just no longer a reachable default). Non-interactive stdin or `--headless` writes the template untouched, no prompts. Dispatch glue lives in `lib/cli/` (`args.ts`, `bootstrap.ts`, `config-wizard.tsx`).
- **Mode** (which backend a launch uses) is resolved in one place, `lib/config/mode.ts`'s `resolveMode`, used by both `cli.ts` and `subcommands/abilities.tsx`: an explicit `--cloud`/`--local` flag, else settings.toml's `preferences.mode` (written by the wizard), else the legacy guess for configs predating that field — a usable chat model means local. The stored preference is what stops "Skip — I'll set up models.toml myself" from silently sending the next launch to cloud login.
- First run under cloud mode (no `settings.toml` yet): `lib/config/config.ts`'s `createCloud()` writes a minimal file with just `[preferences]` `locale` (detected from the system locale, else `en-GB`) — no `persona` (a local-agent concept) and no `stt`/`tts`/`memory` sections. There's no `--lang` flag; language always comes from this file, set once at startup by `lib/cli/bootstrap.ts`'s `detectAndSetLanguage`.

## Layout

```
cli.ts                  # entry
components/             # Ink UI (layout, inputs, timeline, wizard, …)
hooks/                  # agent, settings, voice, dictation, sounds, …
lib/                    # domain subfolders: cli, agent, auth, config, models, personas, memory, abilities,
                        # session, telegram, audio, mcp, image, markdown; cross-cutting utils at lib/ root
subcommands/            # run.tsx (--local), run-cloud.tsx (cloud)
tools/                  # LLM tools (files, web, memory, image, summarize, …)
locales/                # en-GB.toml, hu-HU.toml, nan-TW.toml
assets/                 # sounds, datasets
tests/                  # mirrors source tree
```

Skills (local mode): `~/.config/kaja/marketplace/skills/<name>/` holds every skill (synced or your own), and only names listed in `~/.config/kaja/abilities.toml` load. `tools/index.ts`'s `getDefaultTools` builds `@kaja/nasi`'s folder store from `lib/abilities/abilities-file.ts` and appends `load_skill`, so the TUI and local Telegram both get it. HTTP tool abilities (`marketplace/tools/<name>.toml`, listed in abilities.toml's `tools`) load the same way, with their key from secrets.toml's `[abilities.<name>]` and private hosts allowed; a non-GET one pauses with `confirm_tool`, shown by the same `ConfirmCommand` gate (`kind: "tool"`) and resolved by `use-agent.ts`'s `resolveToolApproval` (local Telegram: a `tool:approve|decline` callback). MCP abilities (`marketplace/mcp/<name>.toml`, abilities.toml's `mcp`) are handed to `createTools` as `mcpAbilities` and connect alongside mcp.toml servers; `kaja abilities` confirms a stdio one's command before enabling it. Personas (`marketplace/personas/<id>.toml`, abilities.toml's `personas`) come from `lib/personas/personas.ts`'s `loadPersonas`: `default` first (that file, else the one bundled from repo `marketplace/personas/default.toml`), then the enabled ones. Datasets (`marketplace/datasets/<topic>.json`) all load through `lib/personas/datasets.ts`, which registers `@kaja/nasi`'s dataset loaders. A missing abilities.toml means nothing is enabled (only `default`), and it is never auto-created.

Zod schemas for this app's config/store/domain types live in `@kaja/schema/config`, `@kaja/schema/store`, `@kaja/schema/cli` (see `packages/schema/AGENTS.md`), not under this package.

### Shared monorepo docs

Default config **templates** (setup wizard) live at **repo root** `docs/config/`:

- `docs/config/settings.toml`
- `docs/config/models.fireworks.toml`, `models.ollama.toml`
- `docs/config/mcp.toml`
- `docs/config/abilities.toml`

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
