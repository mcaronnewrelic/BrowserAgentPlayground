#!/usr/bin/env bash
# Removes the bad-deploy cron job. The deployment markers already recorded in New Relic stay; this only
# stops new ones. Run with sudo on the host:
#
#   sudo bash teardown.sh
set -euo pipefail
NAME='bad-deploy'
if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash teardown.sh" >&2; exit 1; fi
rm -f "/etc/cron.d/$NAME" && echo "Removed /etc/cron.d/$NAME"
echo "Done. Past deployment markers and /var/log/$NAME.log were left in place."
