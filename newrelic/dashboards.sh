#!/usr/bin/env bash
# Creates each dashboard in dashboards/*.json that doesn't exist yet, matched by the dashboard's name.
# Queries in the files are pointed at NEW_RELIC_ACCOUNT_ID, so the same files work for another account.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/dashboards.sh
# GraphQL is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
source "$(dirname "$0")/lib.sh"

DASHBOARD_DIR="${DASHBOARD_DIR:-$(dirname "$0")/../dashboards}"

for file in "$DASHBOARD_DIR"/*.json; do
  name="$(jq -r '.name' "$file")"
  guid="$(entity_guid "$name" "type = 'DASHBOARD'")"
  if [[ -n "$guid" ]]; then
    log "Dashboard exists, skipped: $name ($guid)"
    continue
  fi
  # A page "guid" (from an export) would point at someone else's page, so it's dropped.
  dashboard="$(jq --argjson account "$NEW_RELIC_ACCOUNT_ID" '
    del(.pages[].guid)
    | (.. | objects | select(has("accountIds")) | .accountIds) |= [$account]' "$file")"
  result="$(nerdgraph 'mutation($account: Int!, $dashboard: DashboardInput!) {
      dashboardCreate(accountId: $account, dashboard: $dashboard) { entityResult { guid name } errors { description type } }
    }' "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --argjson dashboard "$dashboard" '{account: $account, dashboard: $dashboard}')")"
  check_result "$result" '.dashboardCreate'
  log "Dashboard created: $name ($(jq -r '.dashboardCreate.entityResult.guid' <<<"$result"))"
done
