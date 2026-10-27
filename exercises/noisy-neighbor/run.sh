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
# While the load runs, it also sends a steady, light stream of requests to the app, so the APM app's
# response time reliably shows the slowdown even when there are no visitors. That traffic stays on the host
# (127.0.0.1), so it doesn't depend on Caddy, DNS, or anyone browsing the site.
#
# Environment (all optional):
#   BIN           the renamed stress-ng, from setup.sh.   Default: /usr/local/bin/noisy-neighbor
#   DURATION      seconds of load.                         Default: 300
#   GRACE         extra seconds before the hard kill.      Default: 30
#   CPU_WORKERS   CPU hogs. 0 = oversubscribe (see below).  Default: 0
#   CPU_OVERSUBSCRIBE  when CPU_WORKERS=0, workers per core. Default: 3
#   VM_WORKERS    memory hogs.                             Default: 1
#   VM_BYTES      memory per VM worker.                    Default: 256M
#   IO_WORKERS    disk I/O hogs.                           Default: 1
#   API_URL       app endpoint to drive.                   Default: http://127.0.0.1:3000/api/recommendations
#   API_CLIENTS   steady requests in flight. 0 = none.     Default: 2
#   LOG           where to append a line per run.          Default: /var/log/noisy-neighbor.log
set -euo pipefail

BIN="${BIN:-/usr/local/bin/noisy-neighbor}"
DURATION="${DURATION:-300}"
GRACE="${GRACE:-30}"
CPU_WORKERS="${CPU_WORKERS:-0}"
CPU_OVERSUBSCRIBE="${CPU_OVERSUBSCRIBE:-3}"
VM_WORKERS="${VM_WORKERS:-1}"
VM_BYTES="${VM_BYTES:-256M}"
IO_WORKERS="${IO_WORKERS:-1}"
# /api/recommendations does real CPU work, so its response time climbs under host CPU contention (unlike
# the lighter endpoints, which are sleep- or IO-bound and barely notice).
API_URL="${API_URL:-http://127.0.0.1:3000/api/recommendations}"
API_CLIENTS="${API_CLIENTS:-2}"
LOG="${LOG:-/var/log/noisy-neighbor.log}"

if [[ ! -x "$BIN" ]]; then
  echo "Not found: $BIN. Run setup.sh first (it installs stress-ng as noisy-neighbor)." >&2
  exit 1
fi

note() { printf '%s noisy-neighbor: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

# One stress worker per core barely dents a light app: the scheduler just shares the cores fairly. To
# actually starve the app of CPU, oversubscribe - run more workers than cores. CPU_WORKERS=0 (the default)
# means CPU_OVERSUBSCRIBE workers per core; a set CPU_WORKERS is used as-is (e.g. 1 for a gentle test).
if [[ "$CPU_WORKERS" -eq 0 ]]; then
  cores="$(nproc 2>/dev/null || echo 1)"
  CPU_WORKERS=$((cores * CPU_OVERSUBSCRIBE))
fi

# Steady app traffic for the duration of the burst, so the APM response-time chart always shows the hit.
# Each client loops: request (capped at 10s), brief pause. Stopped by stop_api_load when the burst ends.
api_pids=()
start_api_load() {
  [[ "$API_CLIENTS" -gt 0 ]] || return 0
  command -v curl >/dev/null || { note "curl not found; skipping API load"; return 0; }
  local i
  for ((i = 0; i < API_CLIENTS; i++)); do
    while :; do curl -fsS -o /dev/null --max-time 10 "$API_URL" || true; sleep 0.5; done &
    api_pids+=("$!")
  done
  note "API load: ${API_CLIENTS} client(s) on ${API_URL}"
}
stop_api_load() {
  [[ ${#api_pids[@]} -gt 0 ]] || return 0
  kill "${api_pids[@]}" 2>/dev/null || true
  wait "${api_pids[@]}" 2>/dev/null || true
  api_pids=()
}
# Always stop the app traffic, even if the burst errors or is interrupted.
trap stop_api_load EXIT

# --keep-name stops stress-ng renaming its workers after each stressor (stress-ng-cpu, -io, -vm), so every
# process shows as noisy-neighbor instead of advertising that it is stress-ng.
note "start: ${DURATION}s, cpu=${CPU_WORKERS} vm=${VM_WORKERS}x${VM_BYTES} io=${IO_WORKERS} (hard stop at $((DURATION + GRACE))s)"
start_api_load
set +e
timeout --signal=TERM --kill-after=10 "$((DURATION + GRACE))" \
  "$BIN" --keep-name --cpu "$CPU_WORKERS" --vm "$VM_WORKERS" --vm-bytes "$VM_BYTES" --io "$IO_WORKERS" \
    --timeout "${DURATION}s" --metrics-brief
status=$?
set -e
stop_api_load

# timeout exits 124 if it had to stop a hung run; treat that as handled, not a crash.
if [[ $status -eq 124 ]]; then
  note "hard-stopped at the timeout (ran longer than ${DURATION}s)"
elif [[ $status -ne 0 ]]; then
  note "stress-ng exited $status"
else
  note "done"
fi
