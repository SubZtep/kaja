#!/usr/bin/env bash
# Builds a "## Changes" release body for a git ref range.
#
# Squash-merged PRs collapse all their commits into one commit on main whose
# body is just the PR title, so a plain `git log` only ever shows one line
# per PR. This instead looks up each commit's merged PR via `gh pr list
# --search <sha>` and expands it to that PR's original commit subjects, so
# squash merges don't flatten the changelog. Commits with no associated PR
# (e.g. direct pushes) fall back to their own subject line. Auto-bump
# commits are always skipped.
set -euo pipefail

RANGE="$1"
PATH_FILTER="${2:-}"

echo "## Changes"

seen_prs=""

while read -r sha subject; do
  [[ "$subject" == "chore: auto bump"* ]] && continue

  pr_number=$(gh pr list --search "$sha" --state merged --json number --jq '.[0].number' 2>/dev/null || true)

  if [[ -n "$pr_number" ]]; then
    if [[ " $seen_prs " == *" $pr_number "* ]]; then
      continue
    fi
    seen_prs="$seen_prs $pr_number"

    while read -r line; do
      [[ "$line" == "chore: auto bump"* ]] && continue
      echo "- $line (#${pr_number})"
    done < <(gh pr view "$pr_number" --json commits --jq '.commits[].messageHeadline')
  else
    echo "- $subject (${sha:0:7})"
  fi
done < <(git log "$RANGE" --pretty='%H %s' -- $PATH_FILTER)
