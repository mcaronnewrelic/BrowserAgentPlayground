#!/usr/bin/env bash
# Creates the hourly synthetic checks for the site, an alert that fires when any of them fails, and the email
# that alert sends. Anything that already exists (by exact name) is skipped.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/synthetics.sh
#
# Environment (all optional):
#   SITE_URL           the site to check. Default: https://browser.nru.to
#   ALERT_EMAIL        who gets the alert email. Default: demo@newrelicuniversity.com
#                      Only used when the email destination is created. To change it later, delete the
#                      destination "Agent Playground alert email" in New Relic and run this again.
#   MONITOR_LOCATIONS  comma-separated public locations. Default: US_WEST_1,US_EAST_1
# GraphQL is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
source "$(dirname "$0")/lib.sh"

SITE_URL="${SITE_URL:-https://browser.nru.to}"
SITE_URL="${SITE_URL%/}"
ALERT_EMAIL="${ALERT_EMAIL:-demo@newrelicuniversity.com}"
MONITOR_LOCATIONS="${MONITOR_LOCATIONS:-US_WEST_1,US_EAST_1}"
MONITOR_DIR="$(dirname "$0")/monitors"

# Every monitor name starts with this: the alert condition and the workload find the monitors by it.
PREFIX='Agent Playground - '
PING_NAME="${PREFIX}Home page (ping)"
API_NAME="${PREFIX}Backend health (API)"
JOURNEY_NAME="${PREFIX}Learning path journey (browser)"
POLICY_NAME='Agent Playground - Synthetic checks'
CONDITION_NAME='A synthetic check failed'
DESTINATION_NAME='Agent Playground alert email'
CHANNEL_NAME='Agent Playground alert email'
WORKFLOW_NAME='Agent Playground - Synthetic check alerts'

locations="$(jq -n --arg csv "$MONITOR_LOCATIONS" '{public: ($csv | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0)))}')"
script_for() { sed "s|__SITE_URL__|$SITE_URL|g" "$MONITOR_DIR/$1"; }

# create_monitor NAME MUTATION INPUT_TYPE MONITOR_JSON
create_monitor() {
  local name="$1" mutation="$2" input_type="$3" monitor="$4" guid result
  guid="$(entity_guid "$name" "domain = 'SYNTH' AND type = 'MONITOR'")"
  if [[ -n "$guid" ]]; then log "Monitor exists, skipped: $name ($guid)"; return; fi
  result="$(nerdgraph "mutation(\$account: Int!, \$monitor: $input_type!) {
      $mutation(accountId: \$account, monitor: \$monitor) { errors { description type } }
    }" "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --argjson monitor "$monitor" '{account: $account, monitor: $monitor}')")"
  check_result "$result" ".$mutation"
  log "Monitor created: $name"
}

# ---- Monitors (hourly) ----------------------------------------------------------------------------------

# Availability: the home page answers, over valid TLS, with its real content.
create_monitor "$PING_NAME" syntheticsCreateSimpleMonitor SyntheticsCreateSimpleMonitorInput "$(jq -n \
  --arg name "$PING_NAME" --arg uri "$SITE_URL/" --argjson locations "$locations" '{
    name: $name, uri: $uri, period: "EVERY_HOUR", status: "ENABLED", locations: $locations,
    advancedOptions: {responseValidationText: "Click it.", useTlsValidation: true}
  }')"

# The backend: /api/health answers and its APM agent is attached.
create_monitor "$API_NAME" syntheticsCreateScriptApiMonitor SyntheticsCreateScriptApiMonitorInput "$(jq -n \
  --arg name "$API_NAME" --arg script "$(script_for api-health.js)" --argjson locations "$locations" '{
    name: $name, period: "EVERY_HOUR", status: "ENABLED", locations: $locations, script: $script,
    runtime: {runtimeType: "NODE_API", runtimeTypeVersion: "22.20.0", scriptLanguage: "JAVASCRIPT"}
  }')"

# End to end, and performance: home page load budget, starting the path, and a trace joined by the backend.
create_monitor "$JOURNEY_NAME" syntheticsCreateScriptBrowserMonitor SyntheticsCreateScriptBrowserMonitorInput "$(jq -n \
  --arg name "$JOURNEY_NAME" --arg script "$(script_for journey.js)" --argjson locations "$locations" '{
    name: $name, period: "EVERY_HOUR", status: "ENABLED", locations: $locations, script: $script,
    browsers: ["CHROME"], devices: ["DESKTOP"],
    runtime: {runtimeType: "CHROME_BROWSER", runtimeTypeVersion: "LATEST", scriptLanguage: "JAVASCRIPT"},
    advancedOptions: {enableScreenshotOnFailureAndScript: true}
  }')"

# ---- Alert policy and condition -------------------------------------------------------------------------

account_vars() { jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$1" '{account: $account, name: $name}'; }

policy_id="$(nerdgraph 'query($account: Int!, $name: String!) { actor { account(id: $account) { alerts {
    policiesSearch(searchCriteria: {name: $name}) { policies { id name } } } } } }' "$(account_vars "$POLICY_NAME")" \
  | jq -r --arg name "$POLICY_NAME" '[.actor.account.alerts.policiesSearch.policies[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$policy_id" ]]; then
  log "Alert policy exists, skipped: $POLICY_NAME ($policy_id)"
else
  policy_id="$(nerdgraph 'mutation($account: Int!, $policy: AlertsPolicyInput!) {
      alertsPolicyCreate(accountId: $account, policy: $policy) { id name } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$POLICY_NAME" \
      '{account: $account, policy: {name: $name, incidentPreference: "PER_CONDITION_AND_TARGET"}}')" | jq -r '.alertsPolicyCreate.id')"
  log "Alert policy created: $POLICY_NAME ($policy_id)"
fi

condition_id="$(nerdgraph 'query($account: Int!, $policy: ID!, $name: String!) { actor { account(id: $account) { alerts {
    nrqlConditionsSearch(searchCriteria: {policyId: $policy, name: $name}) { nrqlConditions { id name } } } } } }' \
  "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg policy "$policy_id" --arg name "$CONDITION_NAME" '{account: $account, policy: $policy, name: $name}')" \
  | jq -r --arg name "$CONDITION_NAME" '[.actor.account.alerts.nrqlConditionsSearch.nrqlConditions[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$condition_id" ]]; then
  log "Alert condition exists, skipped: $CONDITION_NAME ($condition_id)"
else
  # One incident per monitor when any of its checks fails. The checks run hourly, so the window is an hour;
  # the event timer closes it a few minutes after a check result arrives instead of waiting for the next one.
  query="SELECT filter(count(*), WHERE result = 'FAILED') FROM SyntheticCheck WHERE monitorName LIKE '${PREFIX}%' FACET monitorName"
  condition_id="$(nerdgraph 'mutation($account: Int!, $policy: ID!, $condition: AlertsNrqlConditionStaticInput!) {
      alertsNrqlConditionStaticCreate(accountId: $account, policyId: $policy, condition: $condition) { id name } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg policy "$policy_id" --arg name "$CONDITION_NAME" --arg query "$query" '{
      account: $account, policy: $policy,
      condition: {
        name: $name, enabled: true, nrql: {query: $query}, valueFunction: "SINGLE_VALUE",
        signal: {aggregationWindow: 3600, aggregationMethod: "EVENT_TIMER", aggregationTimer: 300},
        terms: [{threshold: 0, operator: "ABOVE", thresholdDuration: 3600, thresholdOccurrences: "AT_LEAST_ONCE", priority: "CRITICAL"}],
        violationTimeLimitSeconds: 86400
      }}')" | jq -r '.alertsNrqlConditionStaticCreate.id')"
  log "Alert condition created: $CONDITION_NAME ($condition_id)"
fi

# ---- Email: destination, channel and workflow --------------------------------------------------------------

destination_id="$(nerdgraph 'query($account: Int!, $name: String!) { actor { account(id: $account) { aiNotifications {
    destinations(filters: {name: $name, type: EMAIL}) { entities { id name } } } } } }' "$(account_vars "$DESTINATION_NAME")" \
  | jq -r --arg name "$DESTINATION_NAME" '[.actor.account.aiNotifications.destinations.entities[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$destination_id" ]]; then
  log "Email destination exists, skipped: $DESTINATION_NAME ($destination_id). Its address is not changed."
else
  destination_id="$(nerdgraph 'mutation($account: Int!, $destination: AiNotificationsDestinationInput!) {
      aiNotificationsCreateDestination(accountId: $account, destination: $destination) { destination { id name } } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$DESTINATION_NAME" --arg email "$ALERT_EMAIL" \
      '{account: $account, destination: {type: "EMAIL", name: $name, properties: [{key: "email", value: $email}]}}')" \
    | jq -r '.aiNotificationsCreateDestination.destination.id // empty')"
  [[ -n "$destination_id" ]] || { log "Creating the email destination failed."; exit 1; }
  log "Email destination created: $DESTINATION_NAME -> $ALERT_EMAIL ($destination_id)"
fi

channel_id="$(nerdgraph 'query($account: Int!, $name: String!) { actor { account(id: $account) { aiNotifications {
    channels(filters: {name: $name}) { entities { id name } } } } } }' "$(account_vars "$CHANNEL_NAME")" \
  | jq -r --arg name "$CHANNEL_NAME" '[.actor.account.aiNotifications.channels.entities[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$channel_id" ]]; then
  log "Email channel exists, skipped: $CHANNEL_NAME ($channel_id)"
else
  channel_id="$(nerdgraph 'mutation($account: Int!, $channel: AiNotificationsChannelInput!) {
      aiNotificationsCreateChannel(accountId: $account, channel: $channel) { channel { id name } } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$CHANNEL_NAME" --arg destination "$destination_id" \
      '{account: $account, channel: {type: "EMAIL", name: $name, destinationId: $destination, product: "IINT", properties: []}}')" \
    | jq -r '.aiNotificationsCreateChannel.channel.id // empty')"
  [[ -n "$channel_id" ]] || { log "Creating the email channel failed."; exit 1; }
  log "Email channel created: $CHANNEL_NAME ($channel_id)"
fi

workflow_id="$(nerdgraph 'query($account: Int!, $name: String!) { actor { account(id: $account) { aiWorkflows {
    workflows(filters: {name: $name}) { entities { id name } } } } } }' "$(account_vars "$WORKFLOW_NAME")" \
  | jq -r --arg name "$WORKFLOW_NAME" '[.actor.account.aiWorkflows.workflows.entities[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$workflow_id" ]]; then
  log "Alert workflow exists, skipped: $WORKFLOW_NAME ($workflow_id)"
else
  # Sends every issue from the policy above, when it opens and when it closes.
  result="$(nerdgraph 'mutation($account: Int!, $workflow: AiWorkflowsCreateWorkflowInput!) {
      aiWorkflowsCreateWorkflow(accountId: $account, createWorkflowData: $workflow) { workflow { id name } errors { description type } } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$WORKFLOW_NAME" --arg policy "$policy_id" --arg channel "$channel_id" '{
      account: $account,
      workflow: {
        name: $name, workflowEnabled: true, destinationsEnabled: true, enrichmentsEnabled: false,
        mutingRulesHandling: "NOTIFY_ALL_ISSUES",
        issuesFilter: {name: $name, type: "FILTER",
          predicates: [{attribute: "labels.policyIds", operator: "EXACTLY_MATCHES", values: [$policy]}]},
        destinationConfigurations: [{channelId: $channel, notificationTriggers: ["ACTIVATED", "CLOSED"]}]
      }}')")"
  check_result "$result" '.aiWorkflowsCreateWorkflow'
  log "Alert workflow created: $WORKFLOW_NAME ($(jq -r '.aiWorkflowsCreateWorkflow.workflow.id' <<<"$result"))"
fi
