#!/bin/zsh
# ESPN sync + NBA game-log refresh for one session, with a macOS notification of the outcome.
# Usage: nightly-sync.sh <session_id>
set -u
SESSION="${1:?usage: nightly-sync.sh <session_id>}"
REPO="${0:A:h:h:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
unset VIRTUAL_ENV
echo "== $(date '+%F %T') sync $SESSION"
cd "$REPO/services/fantasy" || exit 1
OUT="$(uv run python -m app.cli espn-sync "$SESSION" --game-logs 2>&1)"
STATUS=$?
print -r -- "$OUT"
SUMMARY="$(print -r -- "$OUT" | grep -m1 '^ESPN sync:' | sed -E 's/^ESPN sync: //; s/ \(fetched .*//')"
if [[ $STATUS -eq 0 ]]; then
  TITLE="Courtside synced"; BODY="${SUMMARY:-sync finished}"
else
  TITLE="Courtside sync problem"; BODY="$(print -r -- "$OUT" | grep -E 'error|not refreshed' | head -1)"
fi
/usr/bin/osascript -e 'on run argv' -e 'display notification (item 2 of argv) with title (item 1 of argv)' -e 'end run' "$TITLE" "${BODY:-see ~/Library/Logs/Courtside/sync.log}" >/dev/null 2>&1
exit $STATUS
