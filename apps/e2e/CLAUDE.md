# E2E (`apps/e2e`)

Run by hand with `bun e2e [scenario-name...]` from the repo root (never in CI, never part of `bun test`). Needs `docker compose up -d db mail storage`; `bun dev` can keep running.

- `src/stack.ts` drops and rebuilds `<dev database>_e2e` (migrations and config seed), then starts the API and `vite dev` on `E2E_API_PORT`/`E2E_WEB_PORT`, logging to `e2e-out/logs/`. The spawned API switches off what must not reach outside: rate limits, Turnstile and the dev Telegram bot token.
- `src/runner.ts` gives each scenario a fresh browser context with a video; clips land in `e2e-out/clips/<file>.webm`, a failure also leaves `<file>.failed.png`. Videos need Playwright's own ffmpeg: `bunx playwright-core install ffmpeg` once. The browser itself is the system Chromium (`E2E_BROWSER`).
- A scenario is `scenarios/<name>.scenario.ts` with a default `scenario(name, run)`; `run` gets `{ stack, page, newEmail, step }`. Adding a feature's test means adding a file, nothing is registered.
- `t(key)` reads the web's en-GB wording, so selectors survive copy edits.
- `waitForCode(email)` reads the sign-in code from MailDev, once per mail.
- After `goto`, wait for `networkidle`: filling the SSR page before React hydrates gets reset.

## Local model

- A scenario with `{ llm: true }` makes the run start llama.cpp (`src/llama.ts`): a server already answering at `E2E_LLAMA_URL` is reused, else `E2E_LLAMA_BIN -m E2E_LLAMA_MODEL --jinja` is started and stopped after the run. Without a file in `.env` the run needs them on the command line.
- The stack's database keeps only that model (the seeded hosted ones are free too, and a turn picks a random free model), and its API runs with `MODEL_ALLOW_PRIVATE_URLS` so the cloud's SSRF guard lets it reach localhost. Never set that flag on a public host.
- Wrap what depends on the model's words in `model(async () => …)`: it retries once, and a second failure counts as `[model]`, not `[app]`. A provider error that is deterministic (a tool schema llama.cpp refuses, say) fails both tries: that one is an app bug in how it's reported, so read the message before trusting the tag.
- `signUp(stack, email)` (`src/api.ts`) signs a user up through the API and returns a bearer-token client, for scenarios with nothing to see (`video: false`).
