#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/../../.." && pwd)"
migrations_dir="$repo_root/apps/api/migrations"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$repo_root/apps/api/.env" | cut -d '=' -f2-)
  # Remove possible surrounding quotes and whitespace
  DATABASE_URL="${DATABASE_URL%\"}"
  DATABASE_URL="${DATABASE_URL#\"}"
  DATABASE_URL="$(printf '%s' "${DATABASE_URL}" | sed -e 's/^[[:space:]]*//;s/[[:space:]]*$//')"
fi

printf '%s\n' "$migrations_dir"/*.sql | LC_ALL=C sort | while read -r f; do
  echo "applying $f to $DATABASE_URL"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
