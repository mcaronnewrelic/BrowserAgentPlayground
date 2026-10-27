#!/usr/bin/env bash
# Creates latency and availability service levels for the browser app and the APM app behind
# browser.nru.to, unless they exist (by exact name). Each has a 7-day rolling objective.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/service-levels.sh
#
# Environment (all optional):
#   BROWSER_ENTITY_GUID  default: the BrowserAgentPlayground browser app
#   APM_ENTITY_GUID      default: the APM app at browser.nru.to
#
# The availability ones leave out the demo's deliberate failures (the Tracing page's /api/fail button),
# so they show whether the site works rather than how often learners press it. The browser one uses
# AJAX requests rather than JavaScript errors, because the pages throw errors on purpose.
# GraphQL is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
source "$(dirname "$0")/lib.sh"

BROWSER_ENTITY_GUID="${BROWSER_ENTITY_GUID:-NjkzMjM0N3xCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQ3Mzk2OTQ}"
APM_ENTITY_GUID="${APM_ENTITY_GUID:-NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng}"
DELIBERATE_FAILURE='WebTransaction/Custom/api/fail'

# create_service_level ENTITY_GUID NAME DESCRIPTION TARGET VALID_JSON (good|bad) GOOD_OR_BAD_JSON
# VALID_JSON and GOOD_OR_BAD_JSON are {from, where} event queries.
create_service_level() {
  local entity="$1" name="$2" description="$3" target="$4" valid="$5" kind="$6" events="$7" guid result
  guid="$(entity_guid "$name" "type = 'SERVICE_LEVEL'")"
  if [[ -n "$guid" ]]; then log "Service level exists, skipped: $name ($guid)"; return; fi
  result="$(nerdgraph 'mutation($entity: EntityGuid!, $indicator: ServiceLevelIndicatorCreateInput!) {
      serviceLevelCreate(entityGuid: $entity, indicator: $indicator) { guid name } }' \
    "$(jq -n --arg entity "$entity" --arg name "$name" --arg description "$description" --argjson target "$target" \
      --argjson account "$NEW_RELIC_ACCOUNT_ID" --argjson valid "$valid" --arg kind "$kind" --argjson events "$events" '{
        entity: $entity,
        indicator: {
          name: $name, description: $description,
          events: ({accountId: $account, validEvents: $valid} + {("\($kind)Events"): $events}),
          objectives: [{target: $target, timeWindow: {rolling: {count: 7, unit: "DAY"}}}]
        }}')")"
  log "Service level created: $name ($(jq -r '.serviceLevelCreate.guid' <<<"$result"))"
}

query() { jq -n --arg from "$1" --arg where "$2" '{from: $from, where: $where}'; }

# ---- APM: the Node server's web requests ---------------------------------------------------------------

apm_web="entityGuid = '$APM_ENTITY_GUID' AND transactionType = 'Web'"

create_service_level "$APM_ENTITY_GUID" 'Agent Playground API - Latency' \
  'Web requests the server answers in under half a second.' 95 \
  "$(query Transaction "$apm_web")" good "$(query Transaction "$apm_web AND duration < 0.5")"

create_service_level "$APM_ENTITY_GUID" 'Agent Playground API - Success' \
  "Web requests that end without an unexpected error. Leaves out $DELIBERATE_FAILURE, which fails on purpose." 99 \
  "$(query Transaction "$apm_web AND name != '$DELIBERATE_FAILURE'")" bad \
  "$(query TransactionError "entityGuid = '$APM_ENTITY_GUID' AND error.expected IS FALSE AND transactionName != '$DELIBERATE_FAILURE'")"

# ---- Browser: what visitors' browsers see ----------------------------------------------------------------

create_service_level "$BROWSER_ENTITY_GUID" 'Agent Playground Browser - Latency (LCP)' \
  'Page loads whose Largest Contentful Paint is under 2.5 seconds (the "good" Core Web Vitals threshold).' 95 \
  "$(query PageViewTiming "entityGuid = '$BROWSER_ENTITY_GUID' AND timingName = 'largestContentfulPaint'")" good \
  "$(query PageViewTiming "entityGuid = '$BROWSER_ENTITY_GUID' AND timingName = 'largestContentfulPaint' AND largestContentfulPaint < 2.5")"

browser_ajax="entityGuid = '$BROWSER_ENTITY_GUID' AND requestUrl NOT LIKE '%/api/fail%'"
create_service_level "$BROWSER_ENTITY_GUID" 'Agent Playground Browser - Availability (AJAX)' \
  'AJAX requests from the pages that get an answer (not a 5xx or a network failure). Leaves out /api/fail, which fails on purpose.' 99 \
  "$(query AjaxRequest "$browser_ajax")" bad \
  "$(query AjaxRequest "$browser_ajax AND (httpResponseCode >= 500 OR httpResponseCode = 0)")"
