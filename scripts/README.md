# scripts/

Repo-wide dev and ops utilities, run from the monorepo root with `bun run scripts/<name>` (or `./scripts/<name>.sh` for shell scripts). Anything tied to one workspace's build, like Docker image contents, stays in that workspace (see `apps/api/migrate.ts`).

Most of these run for you from git hooks. [Vibe coding](https://docs.kaja.io/development/vibe-coding) explains when, and [Development](https://docs.kaja.io/development#code-generation) lists the commands.

## Generators

Never hand-edit their output. Change the input, then regenerate.

- **`env.ts`** writes each app's `.env.example` from `packages/schema/env/`. `bun generate:env` writes, `bun check:env` fails on drift (and on a `compose.yaml` key no schema knows). The TUI's is hand-written.
- **`env-types.ts`** writes each workspace's ambient `Bun.Env` typing from the same schemas: `bun generate:env-types`.
- **`models.ts`** writes `config/models.*.toml` from `config/catalog.toml`: `bun generate:models`, and `bun check:models` fails on drift (CI and the catalog test).
- **`locales.ts`** keeps every non-en-GB locale file in step with en-GB: same keys, same order. New or changed English gets a `[<locale>] lorem ipsum…` placeholder, and removed keys go away.
  ```sh
  bun sync:locales           # rewrite the other languages
  bun sync:locales --stage   # also git-add what it rewrote (pre-commit)
  bun check:locales          # fail on drift or leftover placeholders (pre-push, CI)
  bun sync:locales --todo    # list placeholders still to translate, as JSON
  bun sync:locales --apply f # write translations back from that JSON (the /translate skill drives these two)
  ```
- **`translate_push.sh`** is the last pre-push job. When `check:locales` fails it runs `claude -p "/translate"`, commits and pushes the translations itself, and exits 1 so the original, now stale push stops.

`lib/env-schema.ts` is a shared helper for the two env generators, not a script.

## SonarCloud

**`sonar.ts`** lists a branch's open SonarCloud issues and unreviewed security hotspots on its pull request (public API, no token): `bun scripts/sonar.ts <branch>`. The `/sonar-fix` skill runs it and fixes them.

## Dev utilities

- **`tool.ts`** runs the Biome or Tombi CLI installed on your machine (neither is a dependency) for `bun lint` and the hooks: `bun scripts/tool.ts tombi format`. When one isn't on the `PATH` it fails with the install link and the version the repo expects, and it warns when the installed major.minor version differs (the patch may differ). `bun scripts/tool.ts tombi --pinned` prints that version (CI installs it). `lib/tools.ts` holds the pins: Tombi's is written there, Biome's is the one in `.biome.json`'s `$schema` URL.
- **`create_local_secrets.sh`** appends a fresh `BETTER_AUTH_SECRET` to `apps/api/.env`. Run it once.
- **`link_user_config.sh`** links the TUI's config dir (resolved with the TUI's own `env-paths`, so `~/.config/kaja` on Linux) into the repo as the gitignored `.user-config`, when that dir exists.
- **`db_migration.sh`** runs `apps/api/migrate.ts` against `$DATABASE_URL` (or `apps/api/.env`), like a deploy: the migrations the database hasn't applied, then the config seed. It catches up an existing `pgdata` volume. First-boot init does this on its own.
- **`mass_user_create.ts [number]`** creates random users against a local API, 10 by default.
- **`barkochba.ts ["secret"]`** self-plays Twenty Questions: a guesser driven by `../marketplace/personas/barkochba.toml` (the kajaio/marketplace checkout) against a thinker holding the secret. Uses your local `models.toml` and `secrets.toml`.
