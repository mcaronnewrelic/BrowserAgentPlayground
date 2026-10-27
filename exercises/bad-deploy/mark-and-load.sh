#!/usr/bin/env bash
# Bad-deploy exercise, host side. Once an hour it:
#   1. records a New Relic change-tracking deployment marker on the APM app, then
#   2. drives light traffic to /api/profile for the rest of the backend's bad-deploy window, so the new
#      error the "deployed" version introduces shows up right after the marker.
# The backend turns the error on by its own clock (BAD_DEPLOY_WINDOW_START/_MINUTES in backend/server.js),
# so the cron minute here must match that window. See README.md.
#
#   NEW_RELIC_API_KEY=NRAK-... bash mark-and-load.sh
#   ENV_FILE=/etc/browser-agent-playground.env bash mark-and-load.sh   # read the key from there
#
# Environment:
#   ENV_FILE                        optional file to source first (e.g. the Compose .env with the key)
#   NEW_RELIC_API_KEY               required: a User key (NRAK-...) allowed to create deployments
#   NEW_RELIC_DEPLOYMENT_ENTITY_GUID  the APM app GUID (default: the browser.nru.to APM app)
#   NERDGRAPH_URL                   default https://api.newrelic.com/graphql (EU: api.eu.newrelic.com)
#   SITE_URL                        default https://browser.nru.to
#   LOAD_SECONDS                    how long to drive traffic. Default: 840 (about 14 minutes)
#   VERSION                         marker version string. Default: demo-<UTC date.time>
#   LOG                             default /var/log/bad-deploy.log
set -euo pipefail

# The env file is Docker's env-file format (KEY=VALUE, with spaces allowed in values), not a shell script.
# Read just the values we need, rather than sourcing it: sourcing would try to run lines like
# "NEW_RELIC_APP_NAME=Browser Agent Playground" as commands.
if [ -n "${ENV_FILE:-}" ] && [ -f "${ENV_FILE}" ]; then
  from_env() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n1 | tr -d '\r'; }
  : "${NEW_RELIC_API_KEY:=$(from_env NEW_RELIC_API_KEY)}"
  : "${NEW_RELIC_DEPLOYMENT_ENTITY_GUID:=$(from_env NEW_RELIC_DEPLOYMENT_ENTITY_GUID)}"
fi

: "${NEW_RELIC_API_KEY:?Set NEW_RELIC_API_KEY (User key) or ENV_FILE that defines it}"
ENTITY_GUID="${NEW_RELIC_DEPLOYMENT_ENTITY_GUID:-NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng}"
NERDGRAPH_URL="${NERDGRAPH_URL:-https://api.newrelic.com/graphql}"
SITE_URL="${SITE_URL:-https://browser.nru.to}"; SITE_URL="${SITE_URL%/}"
LOAD_SECONDS="${LOAD_SECONDS:-840}"
VERSION="${VERSION:-demo-$(date -u +%Y%m%d.%H%M)}"
LOG="${LOG:-/var/log/bad-deploy.log}"

note() { printf '%s bad-deploy: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

# 1. Record the deployment marker. VERSION and the GUID are safe characters, so they go straight into the
# JSON body; the GraphQL $names are query variables, not shell ones.
# shellcheck disable=SC2016
query='mutation($guid: EntityGuid!, $version: String!, $desc: String!) { changeTrackingCreateDeployment(deployment: {entityGuid: $guid, version: $version, description: $desc, deploymentType: BASIC}) { deploymentId } }'
body="{\"query\":\"$query\",\"variables\":{\"guid\":\"$ENTITY_GUID\",\"version\":\"$VERSION\",\"desc\":\"Simulated deploy for the bad-deploy exercise\"}}"
resp="$(curl -sS --max-time 30 "$NERDGRAPH_URL" -H 'Content-Type: application/json' -H "API-Key: $NEW_RELIC_API_KEY" -d "$body")"
case "$resp" in
  *deploymentId*) note "marker recorded: $VERSION" ;;
  *) note "marker request returned: $resp" ;;
esac

# 2. Drive traffic so the new error appears during the window. /api/profile is healthy outside the
# window and throws the bug inside it; this makes the error cluster right after the marker.
end=$(( $(date +%s) + LOAD_SECONDS ))
count=0
while [ "$(date +%s)" -lt "$end" ]; do
  curl -s -o /dev/null --max-time 10 "$SITE_URL/api/profile" || true
  count=$((count + 1))
  sleep 1
done
note "done: $VERSION, $count requests to $SITE_URL/api/profile"
