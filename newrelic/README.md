# New Relic setup scripts

These scripts create what the site needs in New Relic, using the NerdGraph (GraphQL) API. Each one looks up every item by its exact name first and **creates only what is missing**. Nothing is ever updated or deleted.

That makes them safe to run any time. If someone changes one of these items by hand, delete it in New Relic and run the script again to get the original back.

| Script | Creates |
|---|---|
| `dashboards.sh` | Every dashboard in `dashboards/*.json` |
| `synthetics.sh` | Three hourly synthetic monitors on browser.nru.to, an alert policy and condition that fire when any of them fails, and an email destination, channel and workflow that send the alert |
| `workload.sh` | The **Agent Playground** workload: the browser app, the APM app, and the monitors and dashboards above |
| `setup.sh` | All three, in that order |

## What gets created

| Name | Type | Notes |
|---|---|---|
| Agent Playground Knowledge Checks | Dashboard | From `dashboards/knowledge-checks.json` |
| Agent Playground Learning Path | Dashboard | From `dashboards/learning-path.json` |
| Agent Playground - Home page (ping) | Ping monitor | Availability: the home page answers over valid TLS and contains "Click it." |
| Agent Playground - Backend health (API) | Scripted API monitor | `/api/health` answers and the APM agent is attached (`monitors/api-health.js`) |
| Agent Playground - Learning path journey (browser) | Scripted browser monitor | Performance and function: the home page loads within 5 seconds, starting the path opens Install with a running agent, and a Tracing request ends with "Backend joined trace" (`monitors/journey.js`) |
| Agent Playground - Synthetic checks | Alert policy | One incident per monitor |
| A synthetic check failed | NRQL alert condition | Fires when any check of an `Agent Playground - ` monitor fails |
| Agent Playground alert email | Email destination and channel | Sends to `ALERT_EMAIL` |
| Agent Playground - Synthetic check alerts | Alert workflow | Emails every issue from the policy, when it opens and when it closes |
| Agent Playground | Workload | The browser app, the APM app, and any monitor or dashboard named `Agent Playground…` |

The monitors run every hour from two locations. The journey signs in as **Synthetic check**, and the learning-path dashboard leaves that user out so the checks don't count as visitors.

## Run it

You need `bash`, `curl` and `jq`. On Windows, use Git Bash and install jq with `winget install jqlang.jq`. You also need a New Relic **User key** (`NRAK-...`) with permission to create dashboards, synthetics, alerts and workloads. The `NEW_RELIC_API_KEY` secret the change-tracking workflow uses is one.

```bash
export NEW_RELIC_API_KEY=NRAK-...
bash newrelic/setup.sh            # everything
bash newrelic/synthetics.sh       # or just one part
```

On GitHub, the **New Relic setup** workflow runs the same scripts. Run it from the Actions tab, where you can pick one part. It also runs by itself when anything in `newrelic/` changes on `main`.

## Settings

All optional, as environment variables. On GitHub, set the alert email as the repository variable `NEW_RELIC_ALERT_EMAIL`.

| Variable | Default | Used by |
|---|---|---|
| `NEW_RELIC_ACCOUNT_ID` | `6932347` | all; dashboard queries are pointed at this account |
| `NERDGRAPH_URL` | `https://api.newrelic.com/graphql` | all; EU accounts use `https://api.eu.newrelic.com/graphql` |
| `ALERT_EMAIL` | `demo@newrelicuniversity.com` | `synthetics.sh` |
| `SITE_URL` | `https://browser.nru.to` | `synthetics.sh` |
| `MONITOR_LOCATIONS` | `US_WEST_1,US_EAST_1` | `synthetics.sh` |
| `BROWSER_ENTITY_GUID`, `APM_ENTITY_GUID` | this site's two apps | `workload.sh` |

Because existing items are never changed, a setting only applies to items the script creates. For example, to send alerts to a new address: delete the **Agent Playground alert email** destination in New Relic (its channel and workflow with it, if New Relic asks), then run `synthetics.sh` with the new `ALERT_EMAIL`.

## Changing what gets created

- **A dashboard:** edit its JSON in `dashboards/` (export it from New Relic, or edit by hand), then delete the dashboard in New Relic and run `dashboards.sh`.
- **A monitor script:** edit `monitors/*.js`. `__SITE_URL__` is replaced with `SITE_URL` when the monitor is created. Then delete the monitor and run `synthetics.sh`.
- **Names:** the workload and the alert condition find monitors by their `Agent Playground - ` prefix, and dashboards by `Agent Playground`. Keep those prefixes when renaming.
