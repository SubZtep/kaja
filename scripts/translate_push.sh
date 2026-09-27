#!/bin/sh
# pre-push: when locales have untranslated placeholders, runs /translate headless, commits the translations and pushes them; $1 is the remote git passes to the hook
set -eu

remote="${1:-origin}"
locale_dirs="apps/tui/locales apps/api/locales apps/api/widgets/locales apps/web/messages"

zero="0000000000000000000000000000000000000000"
branch="$(git symbolic-ref --quiet --short HEAD || true)"
head="$(git rev-parse HEAD)"

# git lists the pushed refs on stdin: auto-translate only when the checked-out branch is pushed at HEAD; a push of tags or deletions alone skips the check
pushes_branch=false
pushes_head=false
while read -r local_ref local_oid _remote_ref _remote_oid; do
  [ "$local_oid" = "$zero" ] && continue
  case "$local_ref" in refs/heads/*) pushes_branch=true ;; esac
  [ -n "$branch" ] && [ "$local_ref" = "refs/heads/$branch" ] && [ "$local_oid" = "$head" ] && pushes_head=true
done

[ "$pushes_branch" = true ] || exit 0
bun check:locales >/dev/null 2>&1 && exit 0

if [ "$pushes_head" = false ]; then
  echo "untranslated locale keys; auto-translate only runs when pushing the checked-out branch, so run /translate on it" >&2
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "untranslated locale keys and no claude CLI to translate them; run /translate" >&2
  exit 1
fi

echo "untranslated locale keys: running /translate headless..."
bun sync:locales
claude -p "/translate" \
  --permission-mode acceptEdits \
  --allowedTools "Bash(bun sync:locales --todo)" "Bash(bun sync:locales --apply *)" Read Write Agent

if ! bun check:locales; then
  echo "/translate left locales unfinished; fix them and push again" >&2
  exit 1
fi

# shellcheck disable=SC2086
git add $locale_dirs
# shellcheck disable=SC2086
git commit -m "chore(i18n): translate locale placeholders" -- $locale_dirs
# The other pre-push jobs already passed on this tree, and the commit only adds translations
git push --no-verify "$remote" "HEAD:refs/heads/$branch"

# The push in progress still carries the pre-translation commit, and the remote moved past it; stop it
echo "pushed $(git rev-parse --short HEAD) with translations; the push error below is expected" >&2
exit 1
