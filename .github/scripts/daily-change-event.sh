#!/usr/bin/env bash
# Picks today's demo change event for the BrowserLogsDemo site.
#
# Inputs (env):
#   NOW           ISO timestamp to use instead of the current time (tests)
#   GITHUB_OUTPUT file to append key=value outputs to; stdout if empty
#
# The event follows the date in America/Los_Angeles, not the time of day, because GitHub
# starts scheduled runs hours late.
#
# Outputs: category, type, flag_id, version, short_description, description, group_id
set -euo pipefail

TZ_NAME="America/Los_Angeles"
now="${NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
local_date() { TZ="$TZ_NAME" date -d "$now" "$1"; }

dow="$(local_date +%u)"      # 1 = Monday ... 7 = Sunday
ymd="$(local_date +%Y%m%d)"
pretty="$(local_date '+%A %B %-d')"
week="$(local_date +%G-W%V)"

flag_id="" version=""
case "$dow" in
  1) category="Feature Flag"; type="Basic"; flag_id="vitals-poor-by-default"
     short="Flag vitals-poor-by-default re-enabled"
     long="Daily demo event: the vitals page opens in poor mode by default." ;;
  2) category="Business Event"; type="Marketing Campaign"
     short="Fall swag sale banner live"
     long="Daily demo event: the 25% off swag promo banner on the vitals page is running." ;;
  3) category="Operational"; type="Scheduled Maintenance Period"
     short="Scheduled demo maintenance window"
     long="Daily demo event: routine maintenance window for the BrowserLogsDemo site." ;;
  4) category="Deployment"; type="Canary"; version="daily-$ymd"
     short="Daily canary $version"
     long="Daily demo event: simulated canary deployment of the demo pages." ;;
  5) category="Feature Flag"; type="Basic"; flag_id="new-checkout-flow"
     short="Flag new-checkout-flow toggled"
     long="Daily demo event: the new checkout flow flag used in the errors demo was toggled." ;;
  6) category="Business Event"; type="Other"
     short="Weekend traffic expected"
     long="Daily demo event: weekend demo traffic window." ;;
  7) category="Operational"; type="Other"
     short="Weekly demo data review"
     long="Daily demo event: weekly review of demo data before the new week." ;;
esac

emit() {
  local out="${GITHUB_OUTPUT:-}"
  local lines
  lines=$(printf '%s\n' \
    "category=$category" "type=$type" "flag_id=$flag_id" "version=$version" \
    "short_description=$short ($pretty)" "description=$long" "group_id=demo-week-$week")
  if [[ -n "$out" ]]; then printf '%s\n' "$lines" >> "$out"; else printf '%s\n' "$lines"; fi
}
emit
