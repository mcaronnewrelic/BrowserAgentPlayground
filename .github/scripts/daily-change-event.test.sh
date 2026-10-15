#!/usr/bin/env bash
# Tests for daily-change-event.sh. Run: bash .github/scripts/daily-change-event.test.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/daily-change-event.sh"
pass=0

# run NOW -> prints key=value lines
run() { NOW="$1" GITHUB_OUTPUT="" bash "$script"; }
get() { grep -E "^$2=" <<<"$1" | head -1 | cut -d= -f2-; }
expect() { # name actual expected
  if [[ "$2" != "$3" ]]; then echo "FAIL - $1: got '$2', want '$3'"; exit 1; fi
  pass=$((pass + 1))
}

# 2026-10-12 is a Monday. 16:07 UTC = 09:07 PDT.
out=$(run "2026-10-12T16:07:00Z")
expect "mon category" "$(get "$out" category)" "Feature Flag"
expect "mon type" "$(get "$out" type)" "Basic"
expect "mon flag" "$(get "$out" flag_id)" "vitals-poor-by-default"

out=$(run "2026-10-13T16:07:00Z")
expect "tue category" "$(get "$out" category)" "Business Event"
expect "tue type" "$(get "$out" type)" "Marketing Campaign"

out=$(run "2026-10-14T16:07:00Z")
expect "wed category" "$(get "$out" category)" "Operational"
expect "wed type" "$(get "$out" type)" "Scheduled Maintenance Period"

out=$(run "2026-10-15T16:07:00Z")
expect "thu category" "$(get "$out" category)" "Deployment"
expect "thu type" "$(get "$out" type)" "Canary"
expect "thu version" "$(get "$out" version)" "daily-20261015"

out=$(run "2026-10-16T16:07:00Z")
expect "fri category" "$(get "$out" category)" "Feature Flag"
expect "fri flag" "$(get "$out" flag_id)" "new-checkout-flow"

out=$(run "2026-10-17T16:07:00Z")
expect "sat category" "$(get "$out" category)" "Business Event"
expect "sat type" "$(get "$out" type)" "Other"

out=$(run "2026-10-18T16:07:00Z")
expect "sun category" "$(get "$out" category)" "Operational"
expect "sun type" "$(get "$out" type)" "Other"

# Weekday is decided in Pacific time: 2026-10-13T02:00Z is still Monday evening in LA.
out=$(run "2026-10-13T02:00:00Z")
expect "pacific weekday" "$(get "$out" category)" "Feature Flag"

# Every event has the descriptions and a group id for the week.
out=$(run "2026-10-14T16:07:00Z")
[[ -n "$(get "$out" short_description)" ]] && pass=$((pass + 1)) || { echo "FAIL - short_description empty"; exit 1; }
[[ -n "$(get "$out" description)" ]] && pass=$((pass + 1)) || { echo "FAIL - description empty"; exit 1; }
expect "group id" "$(get "$out" group_id)" "demo-week-2026-W42"

# The event follows the date in Los Angeles, never the time of day. GitHub starts scheduled
# runs hours late (observed: 12:59 PM to 3:52 PM Pacific), and a late run must still send.
expect "no skip output" "$(get "$(run 2026-10-14T16:07:00Z)" skip)" ""
expect "late run, same day" "$(get "$(run 2026-10-12T22:52:00Z)" category)" "Feature Flag"       # Monday 3:52 PM PDT
expect "midnight UTC is still the same LA day" "$(get "$(run 2026-10-13T02:30:00Z)" category)" "Feature Flag"  # Monday 7:30 PM PDT
expect "winter late run" "$(get "$(run 2026-12-07T21:10:00Z)" category)" "Feature Flag"           # Monday 1:10 PM PST
expect "LA date, not UTC date" "$(get "$(run 2026-10-13T06:59:00Z)" category)" "Feature Flag"     # Monday 11:59 PM PDT
expect "next LA day starts at 07:00Z" "$(get "$(run 2026-10-13T07:00:00Z)" category)" "Business Event"  # Tuesday 12:00 AM PDT

# When GITHUB_OUTPUT is set, values are written there instead of stdout.
tmp=$(mktemp)
NOW="2026-10-15T16:07:00Z" GITHUB_OUTPUT="$tmp" bash "$script" >/dev/null
expect "writes GITHUB_OUTPUT" "$(grep -E '^category=' "$tmp" | cut -d= -f2-)" "Deployment"
rm -f "$tmp"

echo "$pass checks passed"
