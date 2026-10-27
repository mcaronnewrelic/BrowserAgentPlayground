#!/usr/bin/env bash
# Stops a running burst right now, without removing anything. Use this when a manual test is hammering
# the box and you want your resources back:
#
#   sudo bash stop.sh
#
# It SIGKILLs the renamed binary and any stress-ng workers (which keep the name stress-ng-* unless the
# burst used --keep-name). SIGKILL can't be delayed, so it works even when the host is thrashing.
set -euo pipefail
NAME="${NAME:-noisy-neighbor}"
if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo bash stop.sh" >&2; exit 1; fi

if pkill -9 -f "$NAME|stress-ng"; then
  echo "Sent SIGKILL. Give the host a few seconds to recover."
else
  echo "Nothing matching '$NAME' or 'stress-ng' was running."
fi
