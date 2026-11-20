#!/bin/zsh
# Installs two LaunchAgents for this Mac user:
#   com.courtside.server  starts `make dev` at login (skips while a terminal `make dev` holds :5173)
#   com.courtside.sync    ESPN sync + game logs at 01:30 and 09:00 local time
# Usage: scripts/macos/install.sh <session_id> [--sync-only]
# The session id is written only into ~/Library/LaunchAgents, never into the repo.
set -eu
SESSION="${1:?usage: install.sh <session_id> [--sync-only]}"
SYNC_ONLY="${2:-}"
HERE="${0:A:h}"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/Courtside"
mkdir -p "$AGENTS" "$LOGS"
chmod +x "$HERE/server.sh" "$HERE/nightly-sync.sh"

load() {  # (re)load one agent from its plist
  launchctl bootout "gui/$UID/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$AGENTS/$1.plist"
  echo "loaded $1"
}

cat > "$AGENTS/com.courtside.sync.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.courtside.sync</string>
  <key>ProgramArguments</key><array>
    <string>$HERE/nightly-sync.sh</string><string>$SESSION</string>
  </array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$LOGS/sync.log</string>
  <key>StandardErrorPath</key><string>$LOGS/sync.log</string>
</dict></plist>
PLIST
load com.courtside.sync

if [[ "$SYNC_ONLY" != "--sync-only" ]]; then
cat > "$AGENTS/com.courtside.server.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.courtside.server</string>
  <key>ProgramArguments</key><array><string>$HERE/server.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOGS/server.log</string>
  <key>StandardErrorPath</key><string>$LOGS/server.log</string>
</dict></plist>
PLIST
load com.courtside.server
fi
echo "logs: $LOGS"
