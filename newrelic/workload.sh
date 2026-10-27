#!/usr/bin/env bash
# Creates the "Agent Playground" workload, unless it exists: the browser app, the APM app behind
# browser.nru.to, the synthetic monitors, dashboards and service levels (by name), and the EC2 host (by the
# project=agent-playground tag its infrastructure agent sets in compose.yaml). Because everything but the
# two apps is found by a search, recreating one of them later adds it back to the workload automatically.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/workload.sh
#
# Environment (all optional):
#   BROWSER_ENTITY_GUID  default: the BrowserAgentPlayground browser app
#   APM_ENTITY_GUID      default: the APM app at browser.nru.to (BrowserLogsDemo API)
# GraphQL is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
source "$(dirname "$0")/lib.sh"

WORKLOAD_NAME='Agent Playground'
BROWSER_ENTITY_GUID="${BROWSER_ENTITY_GUID:-NjkzMjM0N3xCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQ3Mzk2OTQ}"
APM_ENTITY_GUID="${APM_ENTITY_GUID:-NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng}"

guid="$(entity_guid "$WORKLOAD_NAME" "type = 'WORKLOAD'")"
if [[ -n "$guid" ]]; then
  log "Workload exists, skipped: $WORKLOAD_NAME ($guid)"
  exit 0
fi

result="$(nerdgraph 'mutation($account: Int!, $workload: WorkloadCreateInput!) {
    workloadCreate(accountId: $account, workload: $workload) { guid name } }' \
  "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$WORKLOAD_NAME" \
    --arg browser "$BROWSER_ENTITY_GUID" --arg apm "$APM_ENTITY_GUID" '{
      account: $account,
      workload: {
        name: $name,
        entityGuids: [$browser, $apm],
        entitySearchQueries: [
          {query: "domain = '\''SYNTH'\'' AND type = '\''MONITOR'\'' AND name LIKE '\''Agent Playground - %'\''"},
          {query: "type = '\''DASHBOARD'\'' AND name LIKE '\''Agent Playground%'\''"},
          {query: "type = '\''SERVICE_LEVEL'\'' AND name LIKE '\''Agent Playground%'\''"},
          {query: "type = '\''HOST'\'' AND tags.project = '\''agent-playground'\''"}
        ],
        scopeAccounts: {accountIds: [$account]}
      }}')")"
log "Workload created: $WORKLOAD_NAME ($(jq -r '.workloadCreate.guid' <<<"$result"))"
