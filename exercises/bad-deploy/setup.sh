#!/usr/bin/env bash
# Installs the hourly cron job for the bad-deploy exercise: once an hour it records a deployment marker and
# drives the traffic that makes the new error appear (mark-and-load.sh). Run it with sudo on the host:
#
#   sudo bash setup.sh
#
# The cron minute must line up with the backend's bad-deploy window (BAD_DEPLOY_WINDOW_START, default 30),
# so the marker lands at the start of the window. Undo with teardown.sh.
#
# Environment (all optional):
#   CRON_MINUTE   minute of each hour to run, UTC.          Default: 30 (matches BAD_DEPLOY_WINDOW_START)
#   ENV_FILE      file holding NEW_RELIC_API_KEY.           Default: /etc/browser-agent-playground.env
#   RUN_USER      user the cron job runs as.                Default: root
set -euo pipefail

NAME='bad-deploy'
CRON_MINUTE="${CRON_MINUTE:-30}"
ENV_FILE="${ENV_FILE:-/etc/browser-agent-playground.env}"
RUN_USER="${RUN_USER:-root}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CRON_FILE="/etc/cron.d/$NAME"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash setup.sh" >&2; exit 1; fi
if [[ ! -f "$ENV_FILE" ]]; then echo "No env file at $ENV_FILE (set ENV_FILE). It must define NEW_RELIC_API_KEY." >&2; exit 1; fi

{
  echo "# $NAME exercise: hourly deployment marker + the traffic that triggers the new error."
  echo "# Installed by exercises/$NAME/setup.sh. Remove with: sudo bash teardown.sh"
  echo "SHELL=/bin/bash"
  echo "$CRON_MINUTE * * * * $RUN_USER ENV_FILE=$ENV_FILE bash $HERE/mark-and-load.sh"
} > "$CRON_FILE"
chmod 0644 "$CRON_FILE"

cat <<EOF

Done.
  Cron:  $CRON_FILE  (every hour at :$CRON_MINUTE UTC, as $RUN_USER)
  Key:   read from $ENV_FILE (NEW_RELIC_API_KEY)
  Log:   /var/log/$NAME.log

Make sure the backend's BAD_DEPLOY_WINDOW_START matches :$CRON_MINUTE. Test it now without waiting:
  sudo ENV_FILE=$ENV_FILE LOAD_SECONDS=60 bash $HERE/mark-and-load.sh
EOF
