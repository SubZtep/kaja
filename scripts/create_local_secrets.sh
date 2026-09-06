#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"

echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> "$repo_root/apps/api/.env"
