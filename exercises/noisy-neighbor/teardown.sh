#!/usr/bin/env bash
# Undoes setup.sh: removes the cron job and the renamed binary. Leaves stress-ng and the log in place.
#
#   sudo bash teardown.sh
#
# Environment (optional):
#   NAME   the renamed binary and cron file.   Default: noisy-neighbor
set -euo pipefail

NAME="${NAME:-noisy-neighbor}"
if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash teardown.sh" >&2; exit 1; fi

rm -f "/etc/cron.d/$NAME" && echo "Removed /etc/cron.d/$NAME"
rm -f "/usr/local/bin/$NAME" && echo "Removed /usr/local/bin/$NAME"

# Stop any burst still running from a manual test or an overlapping cron run.
if pgrep -x "$NAME" >/dev/null; then
  pkill -x "$NAME" && echo "Stopped a running $NAME"
fi

echo "Done. stress-ng and /var/log/$NAME.log were left in place; remove them by hand if you want."
