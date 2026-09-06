# scripts/

Repo-wide dev/ops utilities, run from the monorepo root with `bun run scripts/<name>` (or `bun <name>` for `.ts`, `./scripts/<name>.sh` for shell scripts). Anything coupled to a single workspace's build (e.g. Docker image contents) stays in that workspace's own `scripts/` instead — see `apps/api/scripts/migrate.ts`.

## Env schema tooling

Source of truth for all of this is `packages/schema/env/` (`ApiEnvSchema`, `WebEnvSchema`, `CliEnvSchema`). Edit the schemas there, then regenerate — never hand-edit the generated output.

- **`env.ts`** — generates each app's `.env.example` from its Zod env schema.
  ```sh
  bun run generate:env    # write apps/{api,web}/.env.example
  bun run check:env       # regenerate in memory, diff against disk, exit 1 on drift
                           # (also fails if compose.yaml's api/web services reference an unknown key)
  ```
- **`env-types.ts`** — generates each workspace's ambient `Bun.Env` typing (`declare module "bun" { interface Env {...} } `) from the same schemas, so `process.env.FOO` autocompletes and gets a doc comment.
  ```sh
  bun run generate:env-types    # write apps/api/src/env.d.ts, apps/web/src/env.d.ts, apps/cli/env.d.ts
  ```
- **`lib/env-schema.ts`** — shared field-introspection helper (`inspectFields`) used by both generators above; not a standalone script.

Both generators are wired into `lefthook.toml`'s pre-commit (`stage_fixed = true`), triggered when `packages/schema/env/*.ts` changes (`env.ts` also watches `.env.example`, `compose.yaml`, `disco.*.json`). `check:env` also runs in CI.

## Dev utilities

- **`create_local_secrets.sh`** — appends a freshly generated `BETTER_AUTH_SECRET` to `apps/api/.env`.
  ```sh
  ./scripts/create_local_secrets.sh
  ```
- **`db_migration.sh`** — applies every `apps/api/migrations/*.sql` file (lexicographic order) against `$DATABASE_URL`, or the value in `apps/api/.env` if unset. For manually catching up an existing `pgdata` volume — first-boot init already applies these automatically via the compose mount.
  ```sh
  ./scripts/db_migration.sh
  ```
- **`mass_user_create.ts`** — creates N random users against a locally running API (`POST /auth/sign-up/email`), 10 by default.
  ```sh
  bun run ./scripts/mass_user_create.ts [number]
  ```
