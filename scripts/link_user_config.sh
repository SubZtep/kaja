#!/usr/bin/env bash
# Links the TUI's config dir into the repo as .user-config (gitignored), for editing it beside the code.
# Follows KAJA_PROFILE like the TUI does (kaja-<profile>), and repoints the link when the profile changes.
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
link="$repo_root/.user-config"
profile="${KAJA_PROFILE:-}"
profile_note="${profile:+ (KAJA_PROFILE=$profile)}"

# Same dir the TUI uses: its own env-paths call (apps/tui/lib/paths.ts), resolved from its node_modules
source_dir="$(cd -- "$repo_root/apps/tui" && bun -e 'import envPaths from "env-paths"; console.log(envPaths("kaja", { suffix: process.env.KAJA_PROFILE ?? "" }).config)')"

if [[ ! -d "$source_dir" ]]; then
  echo "No TUI config at $source_dir$profile_note yet (run the TUI once); nothing to link."
  exit 0
fi

if [[ -L "$link" ]]; then
  if [[ "$(readlink -f "$link")" = "$(readlink -f "$source_dir")" ]]; then
    echo ".user-config already links to $source_dir$profile_note."
    exit 0
  fi
  # Our own symlink to another profile's dir: safe to repoint
  previous="$(readlink "$link")"
  ln -sfn "$source_dir" "$link"
  echo "Relinked .user-config -> $source_dir$profile_note (was $previous)"
  exit 0
fi

if [[ -e "$link" ]]; then
  echo ".user-config exists and isn't a symlink; remove it first." >&2
  exit 1
fi

ln -s "$source_dir" "$link"
echo "Linked .user-config -> $source_dir$profile_note"
