#!/usr/bin/env bash
# Creates a host-health alert for the browser.nru.to box: it fires when the host's memory stays nearly full,
# the condition that took the 2 GB instance down with a kernel OOM kill on 2026-10-28 (the traffic
# simulator's long-lived browsers grew until the host ran out of RAM and processes were killed across the
# box). It notifies the same email as the synthetic checks. Anything that already exists (by exact name) is
# skipped.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/alerts.sh
#
# Environment (all optional):
#   HOST_NAME       the infrastructure host to watch. Default: browser.nru.to (NRIA_DISPLAY_NAME in compose.yaml).
#   MEMORY_PERCENT  the memory-used threshold. Default: 90.
#   ALERT_EMAIL     who gets the email. Only used when the shared email destination is created here (it is
#                   usually already there from synthetics.sh). Default: demo@newrelicuniversity.com.
# GraphQL is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
source "$(dirname "$0")/lib.sh"

HOST_NAME="${HOST_NAME:-browser.nru.to}"
MEMORY_PERCENT="${MEMORY_PERCENT:-90}"
ALERT_EMAIL="${ALERT_EMAIL:-demo@newrelicuniversity.com}"

POLICY_NAME='Agent Playground - Host health'
CONDITION_NAME='Host memory nearly full'
DESTINATION_NAME='Agent Playground alert email'
CHANNEL_NAME='Agent Playground alert email'
WORKFLOW_NAME='Agent Playground - Host health alerts'

account_vars() { jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg name "$1" '{account: $account, name: $name}'; }

# ---- Alert policy and condition -------------------------------------------------------------------------

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
  # Host memory used, averaged over each minute. It fires only after five minutes above the threshold, so a
  # brief spike won't page anyone. Scoped to the one host by name, so another agent (e.g. a laptop) is ignored.
  query="SELECT average(memoryUsedPercent) FROM SystemSample WHERE entityName = '${HOST_NAME//\'/\\\'}'"
  condition_id="$(nerdgraph 'mutation($account: Int!, $policy: ID!, $condition: AlertsNrqlConditionStaticInput!) {
      alertsNrqlConditionStaticCreate(accountId: $account, policyId: $policy, condition: $condition) { id name } }' \
    "$(jq -n --argjson account "$NEW_RELIC_ACCOUNT_ID" --arg policy "$policy_id" --arg name "$CONDITION_NAME" \
      --arg query "$query" --argjson threshold "$MEMORY_PERCENT" '{
      account: $account, policy: $policy,
      condition: {
        name: $name, enabled: true, nrql: {query: $query},
        signal: {aggregationWindow: 60, aggregationMethod: "EVENT_FLOW", aggregationDelay: 120, fillOption: "NONE"},
        terms: [{threshold: $threshold, operator: "ABOVE", thresholdDuration: 300, thresholdOccurrences: "ALL", priority: "CRITICAL"}],
        violationTimeLimitSeconds: 86400
      }}')" | jq -r '.alertsNrqlConditionStaticCreate.id')"
  log "Alert condition created: $CONDITION_NAME (above ${MEMORY_PERCENT}% for 5 min) ($condition_id)"
fi

# ---- Email: the shared destination and channel, then a workflow for this policy ----------------------------
# The destination and channel are shared with synthetics.sh (same names): found if that script already made
# them, created here otherwise. The workflow is this policy's own, so it routes host-health issues to the email.

destination_id="$(nerdgraph 'query($account: Int!, $name: String!) { actor { account(id: $account) { aiNotifications {
    destinations(filters: {name: $name, type: EMAIL}) { entities { id name } } } } } }' "$(account_vars "$DESTINATION_NAME")" \
  | jq -r --arg name "$DESTINATION_NAME" '[.actor.account.aiNotifications.destinations.entities[] | select(.name == $name) | .id][0] // empty')"
if [[ -n "$destination_id" ]]; then
  log "Email destination exists, reused: $DESTINATION_NAME ($destination_id)"
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
  log "Email channel exists, reused: $CHANNEL_NAME ($channel_id)"
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
