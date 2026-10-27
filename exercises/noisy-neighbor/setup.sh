#!/usr/bin/env bash
# Sets up the noisy-neighbor bonus exercise on the host (Ubuntu). It:
#   1. installs stress-ng,
#   2. copies it to /usr/local/bin/noisy-neighbor, so the busy process reports under that name,
#   3. installs a daily cron job that runs run.sh.
# Run it with sudo on the EC2 host, from this folder:
#
#   sudo bash setup.sh
#
# Safe to run again: it reinstalls the binary and rewrites the cron file. Undo with teardown.sh.
#
# Environment (all optional):
#   CRON_TIME     "minute hour" for the daily run, UTC.   Default: "0 15"  (15:00 UTC)
#   NAME          the renamed binary.                      Default: noisy-neighbor
#   RUN_USER      user the cron job runs as.               Default: root
#   DURATION, CPU_WORKERS, VM_WORKERS, VM_BYTES, IO_WORKERS  passed through to run.sh (see it for defaults)
set -euo pipefail

NAME="${NAME:-noisy-neighbor}"
CRON_TIME="${CRON_TIME:-0 15}"
RUN_USER="${RUN_USER:-root}"
BIN="/usr/local/bin/$NAME"
HERE="$(cd "$(dirname "$0")" && pwd)"
CRON_FILE="/etc/cron.d/$NAME"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash setup.sh" >&2; exit 1; fi

echo "1/3 Installing stress-ng..."
if ! command -v stress-ng >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq stress-ng
fi
src="$(command -v stress-ng)"

echo "2/3 Installing $BIN (a copy of $src)..."
# A copy, not a symlink, so the worker processes' command name is "$NAME", not "stress-ng".
install -m 0755 "$src" "$BIN"

echo "3/3 Installing the daily cron job at $CRON_FILE ($CRON_TIME UTC)..."
# Pass-throughs let you tune intensity from one place; run.sh supplies defaults for anything unset.
{
  echo "# $NAME bonus exercise: a daily burst of host load. Installed by exercises/$NAME/setup.sh."
  echo "# Remove with: sudo bash teardown.sh"
  echo "SHELL=/bin/bash"
  printf 'BIN=%s\n' "$BIN"
  for v in DURATION CPU_WORKERS VM_WORKERS VM_BYTES IO_WORKERS; do
    [[ -n "${!v:-}" ]] && printf '%s=%s\n' "$v" "${!v}"
  done
  echo "$CRON_TIME * * * $RUN_USER bash $HERE/run.sh"
} > "$CRON_FILE"
chmod 0644 "$CRON_FILE"

cat <<EOF

Done.
  Binary:   $BIN
  Cron:     $CRON_FILE  (daily at $CRON_TIME UTC, as $RUN_USER)
  Log:      /var/log/$NAME.log

Test it now without waiting for cron:
  sudo bash $HERE/run.sh
Watch the host in New Relic, then (optionally) tune intensity in $CRON_FILE.
EOF
