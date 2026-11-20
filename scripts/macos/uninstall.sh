#!/bin/zsh
# Removes the Courtside LaunchAgents (stops the background server and the scheduled sync).
for label in com.courtside.server com.courtside.sync; do
  launchctl bootout "gui/$UID/$label" 2>/dev/null && echo "stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
