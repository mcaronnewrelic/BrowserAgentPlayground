# shellcheck shell=bash
# The GraphQL in these scripts is single-quoted on purpose: its $names are GraphQL variables, not shell ones.
# shellcheck disable=SC2016
# Shared helpers for the New Relic setup scripts. Sourced, not run.
#
# Environment:
#   NEW_RELIC_API_KEY     a User key (NRAK-...), required. The same key the change-tracking workflow uses.
#   NEW_RELIC_ACCOUNT_ID  the account to create things in. Default: 6932347.
#   NERDGRAPH_URL         default https://api.newrelic.com/graphql (EU accounts: https://api.eu.newrelic.com/graphql).
#
# Every script only creates what is missing, matched by exact name. Nothing is ever updated or deleted:
# to rebuild something that was changed by hand, delete it in New Relic and run the script again.

set -euo pipefail

: "${NEW_RELIC_API_KEY:?Set NEW_RELIC_API_KEY to a New Relic User key (NRAK-...)}"
NEW_RELIC_ACCOUNT_ID="${NEW_RELIC_ACCOUNT_ID:-6932347}"
NERDGRAPH_URL="${NERDGRAPH_URL:-https://api.newrelic.com/graphql}"

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "This script needs $tool (on Windows: winget install jqlang.jq)." >&2; exit 1; }
done

log() { printf '%s\n' "$*" >&2; }

# nerdgraph QUERY [VARIABLES_JSON]: runs one GraphQL request and prints its "data" as JSON.
# Values travel as GraphQL variables, so names, NRQL and monitor scripts never need escaping.
# Exits on HTTP errors and on GraphQL errors.
nerdgraph() {
  local query="$1" variables="${2:-}" body response
  [[ -n "$variables" ]] || variables='{}'
  body="$(jq -n --arg query "$query" --argjson variables "$variables" '{query: $query, variables: $variables}')"
  response="$(curl -sS --fail-with-body --max-time 60 "$NERDGRAPH_URL" \
    -H 'Content-Type: application/json' -H "API-Key: $NEW_RELIC_API_KEY" --data-binary "$body")" || {
    log "NerdGraph request failed: $response"; exit 1;
  }
  if jq -e '(.errors // []) | length > 0' >/dev/null <<<"$response"; then
    log "NerdGraph returned errors:"; jq '.errors' <<<"$response" >&2; exit 1
  fi
  jq '.data' <<<"$response"
}

# Fails when a mutation's own error field (errors / error) reports a problem.
# check_result JSON PATH: PATH is the jq path to the mutation result, e.g. '.dashboardCreate'.
check_result() {
  local json="$1" path="$2"
  if jq -e "$path | ((.errors // []) | length > 0) or (.error != null)" >/dev/null <<<"$json"; then
    log "Create failed:"; jq "$path | {errors, error}" <<<"$json" >&2; exit 1
  fi
}

# entity_guid NAME ENTITY_SEARCH_CONDITION: prints the GUID of the entity with exactly this name in this
# account, or nothing. Entity search also matches similar names, so the name is compared exactly here.
entity_guid() {
  local name="$1" condition="$2" query data
  query="accountId = $NEW_RELIC_ACCOUNT_ID AND $condition AND name = '${name//\'/\\\'}'"
  data="$(nerdgraph 'query($q: String!) { actor { entitySearch(query: $q) { results { entities { guid name } } } } }' \
    "$(jq -n --arg q "$query" '{q: $q}')")"
  jq -r --arg name "$name" '[.actor.entitySearch.results.entities[] | select(.name == $name) | .guid][0] // empty' <<<"$data"
}
