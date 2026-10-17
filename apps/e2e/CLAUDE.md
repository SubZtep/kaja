# E2E (`apps/e2e`)

Run by hand with `bun e2e [scenario-name...]` from the repo root (never in CI, never part of `bun test`). Needs `docker compose up -d db mail storage`; `bun dev` can keep running.

- `src/stack.ts` drops and rebuilds `<dev database>_e2e` (migrations and config seed), then starts the API and `vite dev` on `E2E_API_PORT`/`E2E_WEB_PORT`, logging to `e2e-out/logs/`. The spawned API switches off what must not reach outside: rate limits, Turnstile and the dev Telegram bot token.
- `src/runner.ts` gives each scenario a fresh browser context with a video; clips land in `e2e-out/clips/<file>.webm`, a failure also leaves `<file>.failed.png`. Videos need Playwright's own ffmpeg: `bunx playwright-core install ffmpeg` once. The browser itself is the system Chromium (`E2E_BROWSER`).
- A scenario is `scenarios/<name>.scenario.ts` with a default `scenario(name, run)`; `run` gets `{ stack, page, newEmail, step }`. Adding a feature's test means adding a file, nothing is registered.
- `t(key)` reads the web's en-GB wording, so selectors survive copy edits.
- `waitForCode(email)` reads the sign-in code from MailDev, once per mail.
- After `goto`, wait for `networkidle`: filling the SSR page before React hydrates gets reset.
