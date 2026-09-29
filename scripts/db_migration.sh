#!/bin/sh
# Migrates the local database the way a deploy does (apps/api/migrate.ts): the files it hasn't run yet, then the config seed.
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
cd "$repo_root"

if [ -n "${DATABASE_URL:-}" ]; then
  exec bun apps/api/migrate.ts
fi
exec bun --env-file=apps/api/.env apps/api/migrate.ts
