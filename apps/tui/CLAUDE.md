# @kaja/tui

Terminal chat with personas, tools, mic dictation, TTS, MCP and a local Telegram bot. The entry point is `cli.ts` at the package root (not `src/`). `memory.sqlite` is nasi's `createSqlStore` over `Bun.SQL` (`lib/store/sqlite.ts`), every row under `LOCAL_USER_ID`.

## Modes

- `lib/config/mode.ts`'s `resolveMode`: `--cloud`/`--local`, else settings.toml's `preferences.mode`, else a legacy guess; no config → the wizard asks
- **Cloud**: no local agent, sqlite, MCP or shell tools; SSE to `<apiUrl>/nasi/*`. Device login; the token lives only in `Bun.secrets` (`kaja-tui`, `kaja-tui-<profile>` under `KAJA_PROFILE`); no keychain → error recommending `--local`
- **Local**: `@kaja/nasi` with the user's `models.toml`, never a silent fallback to cloud
- `components/layout/app.tsx` is the one UI for both (`LocalApp`/`CloudApp`)
- The app writes `~/.config/kaja/*.toml` only in first-run setup and `kaja config wizard|fetch|hooks`. Language, thinking, toolDisplay and voice are read once at startup
- Quitting kills every tracked child (`installShutdownHandlers`)

## UI

- **Keys**: input hooks use `hooks/use-key.ts`'s `useKey` (the kitty protocol sends releases, `useKey` drops them), never Ink's `useInput`. Mouse, focus and colour-scheme reports come via `hooks/use-terminal-reports.ts` (Ink 8 drops unknown control sequences)
- **Hotkeys**: one `KeyBinding` list in `app.tsx`; a hidden entry (`when` false) has no live hotkey, `inBar: false` keeps a live one off the key line (it must fit in 78 columns; the help screen lists it). "R" copies (Ctrl+C is Ink's quit), "L" is help (Ctrl+H = Backspace); F-keys and Ctrl+digit don't work reliably. The modifier is `preferences.hotkeyModifier` because no single one works everywhere
- **Modals** (`components/elem/modal.tsx`): while one is open `InputBlockedContext` silences `useKey` outside it, so a modal's key handling lives in a component rendered _inside_ `<Modal>`. Esc or a footer click calls `onClose`
- **Prompts** (`components/layout/prompt.tsx`): a `PromptSpec` list in place of the input; `ConfirmCommand` (approvals) and `ask_user` options use it. An approval's command shows in `CommandModal`, never in the chat
- **Theme**: every colour lives in `components/theme.tsx`; components use palette roles or styles. A nested `ThemeProvider` extends the surrounding theme. Output outside the chat uses `resolveConsoleTheme()`. `auto` is resolved before Ink renders (it reads stdin)
- **Markdown**: `lib/markdown/blocks.ts`'s `splitBlocks` caches per block so streaming re-renders only the last; add a `blocks.test.ts` sample when the splitter learns a case
- **Images**: a drawn picture is cached by source and size (`lib/image/render-terminal-image.ts`), not in row state: unmounted rows would come back without it and the viewport flickers. Failures aren't cached
- **Ink is patched** (`patches/ink@8.0.0.patch`, soft-wrap leading space): bumping Ink means redoing the patch or dropping it if upstream fixed it
- **Hooks**: optional `hooks.toml` (`kaja config hooks`); no file = silence. `fireHook(name, event)` is the one entry point; commands are unref'd to outlive a quit. Sounds/notifications use system utilities (`lib/hooks/detect.ts`), no npm packages; wav files are downloaded by `syncSounds` since an external player can't open files inside the binary
- **Logging**: `lib/logger.ts`, a JSON-lines file, silent unless `KAJA_LOG_LEVEL` and `KAJA_LOG_FILE` are set; never the terminal (Ink owns it)

## CLI

- `login`, `logout`, `config`, `abilities`, `sessions` run before the mode branch; `config` touches local files only and never triggers cloud login
- `--headless` is only for `telegram` (`--local` only)
- **Update check** (`lib/cli/update-check.ts`, compiled binary only): declining exits in cloud mode (the API supports only the latest TUI); `--headless` only prints, since a prompt would block an unattended bot
- **`abilities update`** syncs the repo's `marketplace/` into `~/.config/kaja/marketplace/`; `.sync-lock.json` hashes tell untouched copies from user edits (edited files are backed up, added ones never touched)
- **`doctor`** (`--local`): `runCredentialPass` first, then models/MCP/tools. Only a `"credential"` failure (401/403) asks for a new value; `"unreachable"` is reported and skipped (a stopped local server needs starting, not a key)
- **Tool hosts**: settings.toml `[tools.hosts]` sends a stdio ability to a sandbox via the API's relay with the stored cloud token
- **Cloud turns use this computer** (`lib/cloud/computer.ts`): the user's own and local-only abilities and file builtins (`run_command` only with `[tools.hosts] shell = "computer"`) run here on `needs_client_tool`, through the same `ConfirmCommand` gate
- Shell commands that skip approval: nasi's `DEFAULT_SAFE_COMMANDS` plus commands.toml's `custom`; nothing writes commands.toml

## First-run wizard

`components/config-wizard.tsx` is the one setup flow (first run in a TTY, and `kaja config wizard`); non-interactive writes a minimal settings.toml.

- Every step opens on the current value (`readPrefill`), so Enter throughout keeps a machine unchanged. `--cloud`/`--local` skip the mode step; a prefilled mode does not
- Steps are grouped into blocks (`BLOCK_OF_KIND`) shown in the header; Esc pops `history`, and the trail is drawn from it each render (not Ink `<Static>`), so finished blocks fold and a changed answer updates its line
- **Keys are typed in the wizard but saved by the credential pass**, so each is tested first. In `offered`, `null` means "asked and turned down" (`""` in `WizardResult`) versus `undefined` "never applied": losing that distinction brings back the double-ask
- `refreshCatalog` loads models.dev's `api.json` (the cached last good copy when it can't); with neither, the providers checklist is skipped and the custom-provider steps ask everything, offering the models its `/models` lists. models.dev has no defaults: the wizard asks which tasks to set up, then a model per task, best guess first (`candidatesByTask`). `KNOWN_BASE_URLS` covers big providers models.dev lists without an `api`
- The Sounds block asks about each hook program `detectBackends` found (`hookPrograms`), opening on `currentHooks(hooks.toml)`; the runner's `applyHooks` writes only when the answers differ. `kaja config hooks` keeps its own prompts (`offerHooks`)
- The marketplace questions sit in Extras, asked only when `checkGit` passes (`gitReady`); the runner's `applyMarketplace` saves them and fetches. The last frame ends in "✓ All set. Saved to …"; the runner then prints a "Finishing up" rule (`sectionRule`) and its output on the same grid (`statusLine` with a `subject`)
- `detectLocalServers` (`lib/models/detect.ts`) probes the usual local ports and OLLAMA_HOST etc. alongside the models.dev fetch; found servers arrive as `WizardResult.local`, ticked, with tasks guessed from model ids. A models.toml provider at the same address keeps its id
- Typed answers are tested live through the `probe` prop (`GET /models` with the key: 401/403 is refused, anything else unverified); the component itself does no I/O. A key found in the provider's env var can be saved as `api_key_env` (secrets.toml names the variable; `providerKey` resolves it)
- The setup grid (`components/elem/rail.tsx`): gutter mark in column 2, labels from 4, values from 18 (`padLabel`), nothing past 78 (`textWidth`). `Question` brackets a question from ◆ to a └ hint (`KeyHint`); menus inside one draw rail rows (`useInRail`), elsewhere their old look until the chat screen is redesigned
- Every config file is written through `lib/config/schema-file.ts`'s `writeConfigFile` (or edited in place): a `#:schema ./schemas/<f>.json` line on top, and this build's schema copied beside it. Defaults live in code and the Zod schemas (`PREFERENCE_DEFAULTS`), never in templates

## Abilities and personas (local)

- `~/.config/kaja/marketplace/abilities/<name>/`: any mix of `SKILL.md`, `tool.toml`, `mcp.toml`, `tool.ts`. The folder name is the ability's name
- Every valid ability loads; the active persona's `abilities` decide what a chat gets. MCP servers connect only for such a persona (`kaja doctor` connects all)
- Personas load `default` first, then by id; ones `.sync-lock.json` doesn't record are the user's own (`local`)

## Conventions

- User-facing strings go through `t()` (`lib/i18n.ts`)
- Ask first about ambiguous product behaviour, refactors with many call sites, and new tools, personas or provider presets
