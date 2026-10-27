#!/usr/bin/env bash
# Runs one burst of "noisy neighbor" load on the host: a copy of stress-ng named noisy-neighbor, so the
# New Relic infrastructure agent reports the busy process as "noisy-neighbor" rather than "stress-ng".
# This is what the daily cron job runs, and what you run by hand to test (see README.md).
#
#   sudo bash run.sh                 # one burst with the defaults below
#   DURATION=120 CPU_WORKERS=2 sudo bash run.sh
#
# It is deliberately bounded: stress-ng stops itself after DURATION, and an outer timeout stops it after
# DURATION + GRACE even if it hangs, so it can never run away on a small instance.
#
# Environment (all optional):
#   BIN           the renamed stress-ng, from setup.sh.   Default: /usr/local/bin/noisy-neighbor
#   DURATION      seconds of load.                         Default: 300
#   GRACE         extra seconds before the hard kill.      Default: 30
#   CPU_WORKERS   CPU hogs. 0 = one per core.              Default: 0 (all cores)
#   VM_WORKERS    memory hogs.                             Default: 1
#   VM_BYTES      memory per VM worker.                    Default: 256M
#   IO_WORKERS    disk I/O hogs.                           Default: 1
#   LOG           where to append a line per run.          Default: /var/log/noisy-neighbor.log
set -euo pipefail

BIN="${BIN:-/usr/local/bin/noisy-neighbor}"
DURATION="${DURATION:-300}"
GRACE="${GRACE:-30}"
CPU_WORKERS="${CPU_WORKERS:-0}"
VM_WORKERS="${VM_WORKERS:-1}"
VM_BYTES="${VM_BYTES:-256M}"
IO_WORKERS="${IO_WORKERS:-1}"
LOG="${LOG:-/var/log/noisy-neighbor.log}"

if [[ ! -x "$BIN" ]]; then
  echo "Not found: $BIN. Run setup.sh first (it installs stress-ng as noisy-neighbor)." >&2
  exit 1
fi

note() { printf '%s noisy-neighbor: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

# --cpu 0 means one worker per online CPU: deliberately aggressive, to crowd out the app's containers.
# --keep-name stops stress-ng renaming its workers after each stressor (stress-ng-cpu, -io, -vm), so every
# process shows as noisy-neighbor instead of advertising that it is stress-ng.
note "start: ${DURATION}s, cpu=${CPU_WORKERS} vm=${VM_WORKERS}x${VM_BYTES} io=${IO_WORKERS} (hard stop at $((DURATION + GRACE))s)"
set +e
timeout --signal=TERM --kill-after=10 "$((DURATION + GRACE))" \
  "$BIN" --keep-name --cpu "$CPU_WORKERS" --vm "$VM_WORKERS" --vm-bytes "$VM_BYTES" --io "$IO_WORKERS" \
    --timeout "${DURATION}s" --metrics-brief
status=$?
set -e

# timeout exits 124 if it had to stop a hung run; treat that as handled, not a crash.
if [[ $status -eq 124 ]]; then
  note "hard-stopped at the timeout (ran longer than ${DURATION}s)"
elif [[ $status -ne 0 ]]; then
  note "stress-ng exited $status"
else
  note "done"
fi
