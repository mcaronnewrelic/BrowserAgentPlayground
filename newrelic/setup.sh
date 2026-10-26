#!/usr/bin/env bash
# Creates everything the site needs in New Relic that is missing: dashboards, synthetic checks and their
# alert email, and the workload. Safe to run any number of times: existing items are left alone.
#
#   NEW_RELIC_API_KEY=NRAK-... bash newrelic/setup.sh
#
# Each step can also run on its own: dashboards.sh, synthetics.sh, workload.sh. See newrelic/README.md.
set -euo pipefail
here="$(dirname "$0")"
bash "$here/dashboards.sh"
bash "$here/synthetics.sh"
# Last, so the workload's searches already find the monitors and dashboards.
bash "$here/workload.sh"
