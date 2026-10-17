# E2E (`apps/e2e`)

Run by hand with `bun e2e [scenario-name...]` from the repo root (never in CI, never part of `bun test`). Needs `docker compose up -d db mail storage`; `bun dev` can keep running.

- `src/stack.ts` drops and rebuilds `<dev database>_e2e` (migrations and config seed), then starts the API and `vite dev` on `E2E_API_PORT`/`E2E_WEB_PORT`, logging to `e2e-out/logs/`. The spawned API switches off what must not reach outside: rate limits, Turnstile and the dev Telegram bot token.
- `src/runner.ts` gives each scenario a fresh browser context with a video; clips land in `e2e-out/clips/<file>.webm`, a failure also leaves `<file>.failed.png`. Videos need Playwright's own ffmpeg: `bunx playwright-core install ffmpeg` once. The browser itself is the system Chromium (`E2E_BROWSER`).
- A scenario is `scenarios/<name>.scenario.ts` with a default `scenario(name, run)`; `run` gets `{ stack, page, newEmail, step }`. Adding a feature's test means adding a file, nothing is registered.
- A second recorded page: `newPage("tui")` (saved as `<file>.tui.webm`). `startTui(stack, page)` (`src/tui.ts`) runs the real `apps/tui/cli.ts --cloud` in a PTY (Bun's `terminal` spawn option) and draws it with xterm.js on that page, so the terminal is an ordinary browser video. It has its own config/data folders (XDG vars under `e2e-out/tui-home`), its own keychain entry (profile `e2e`; its token is deleted at start) and a fake `$BROWSER` that only records the device-login URL, so a run never opens your real browser. `tui.submit(text)` types, waits, then presses Enter (text and Enter in one chunk is a paste to Ink); `tui.waitFor(text)` polls the screen. `tuiText("cli.key")` is the TUI's English wording.
- Telegram is faked (`src/telegram.ts`, started with the stack as `stack.telegram`): a Bot API server the API's bot long-polls (`TELEGRAM_API_ROOT`, with a fake token), and a Telegram-style chat window (`src/telegram-page.ts`) on a recorded `newPage("telegram")`. Scenarios type into that window (`say`, `openLink` = send `/start <token>` from a `t.me` link, `attachImage`, `press` an inline button), and assert on what the bot said (`waitForBot`, `botMessages`, edited text included). Bot API methods the bot starts using that the fake lacks fail with "The fake Bot API has no <method>": add them there. `apiText("telegram.linkConfirm")` is the API's English wording.
- Each recorded scenario lingers 1.5 s at the end, since the recorder drops the last moments before a context closes.
- `src/web.ts` has `signUpOnWeb` / `signInOnWeb`, for scenarios that need an account first.
- An answer assertion must not be satisfiable by the question's own words: the screen holds both.
- `t(key)` reads the web's en-GB wording, so selectors survive copy edits.
- `waitForCode(email)` reads the sign-in code from MailDev, once per mail.
- After `goto`, wait for `networkidle`: filling the SSR page before React hydrates gets reset.

## The model

- Set `E2E_LLM_API_KEY` in the gitignored `apps/e2e/.env` to use a hosted provider (Fireworks's `minimax-m3` by default, `E2E_LLM_BASE_URL`/`E2E_LLM_MODEL` change it): quick and cheap, and the way to run on a machine without a usable GPU. Unset, the local llama.cpp below is used.

### Local llama.cpp

- A scenario with `{ llm: true }` makes the run start llama.cpp (`src/llama.ts`): a server already answering at `E2E_LLAMA_URL` is reused, else `E2E_LLAMA_BIN -m E2E_LLAMA_MODEL --jinja` is started and stopped after the run. Without a file in `.env` the run needs them on the command line.
- The stack's database keeps only that model (the seeded hosted ones are free too, and a turn picks a random free model), and its API runs with `MODEL_ALLOW_PRIVATE_URLS` so the cloud's SSRF guard lets it reach localhost. Never set that flag on a public host.
- With a hosted provider the database gets one model per task: chat (`E2E_LLM_MODEL`), `summarize`, `vision` and `rerank` (`E2E_LLM_*_MODEL`); the local llama does chat and summarising alone. A chat model row has `images = false`, so images always go through the vision model's descriptions.
- Wrap what depends on the model's words in `model(async () => …)`: it retries once, and a second failure counts as `[model]`, not `[app]`. A provider error that is deterministic (a tool schema llama.cpp refuses, say) fails both tries: that one is an app bug in how it's reported, so read the message before trusting the tag.
- `signUp(stack, email)` (`src/api.ts`) signs a user up through the API and returns a bearer-token client (`turn`, `compact`, `sessions`, `call`/`json` for any route), for scenarios with nothing to see (`video: false`). Check the API's own answers (status, ids, who sees what) as strictly as you like; only the model's words need `model()`.
- A turn that asks the player something ends as `needs_input`, which is a success for such a persona.
