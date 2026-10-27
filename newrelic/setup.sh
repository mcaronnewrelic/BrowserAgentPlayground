#!/usr/bin/env bash
# Creates everything the site needs in New Relic that is missing: dashboards, synthetic checks and their
# alert email, service levels, and the workload. Safe to run any number of times: existing items are left alone.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/setup.sh
#
# Each step can also run on its own: dashboards.sh, synthetics.sh, service-levels.sh, workload.sh.
# See newrelic/README.md.
set -euo pipefail
here="$(dirname "$0")"
bash "$here/dashboards.sh"
bash "$here/synthetics.sh"
bash "$here/service-levels.sh"
# Last, so the workload's searches already find the monitors, dashboards and service levels.
bash "$here/workload.sh"
