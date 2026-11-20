#!/bin/zsh
# Runs `make dev` for the Courtside login item. If something already serves the UI port (a
# `make dev` in a terminal), exit cleanly: launchd only restarts this job after a failure.
set -u
REPO="${0:A:h:h:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if /usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "$(date '+%F %T') port 5173 already in use; leaving it to the running server"
  exit 0
fi
echo "$(date '+%F %T') starting make dev"
cd "$REPO" && exec /usr/bin/make dev
