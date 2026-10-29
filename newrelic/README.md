# New Relic setup scripts

These scripts create what the site needs in New Relic, using the NerdGraph (GraphQL) API. Each one looks up every item by its exact name first and **creates only what is missing**. Nothing is ever updated or deleted.

That makes them safe to run any time. If someone changes one of these items by hand, delete it in New Relic and run the script again to get the original back.

| Script | Creates |
|---|---|
| `dashboards.sh` | Every dashboard in `dashboards/*.json` |
| `synthetics.sh` | Three hourly synthetic monitors on browser.nru.to, an alert policy and condition that fire when any of them fails, and an email destination, channel and workflow that send the alert |
| `alerts.sh` | A host-health alert policy, condition and workflow that fire when browser.nru.to's memory stays nearly full, reusing the synthetic checks' alert email |
| `service-levels.sh` | Latency and availability service levels for the APM app and the browser app |
| `workload.sh` | The **Agent Playground** workload: the browser app, the APM app, and the monitors, dashboards and service levels above |
| `setup.sh` | All five, in that order |

## What gets created

| Name | Type | Notes |
|---|---|---|
| Agent Playground Knowledge Checks | Dashboard | How all real visitors answer the Check yourself questions. From `dashboards/knowledge-checks.json`; leaves out simulated visitors (`SIM-` codes) |
| Agent Playground Your Knowledge Checks | Dashboard | One learner's own answers, filtered by a `demoCode` session-code variable. From `dashboards/your-knowledge-checks.json` |
| Agent Playground Learning Path | Dashboard | From `dashboards/learning-path.json` |
| Agent Playground - Home page (ping) | Ping monitor | Availability: the home page answers over valid TLS and contains "Click it." |
| Agent Playground - Backend health (API) | Scripted API monitor | `/api/health` answers and the APM agent is attached (`monitors/api-health.js`) |
| Agent Playground - Learning path journey (browser) | Scripted browser monitor | Performance and function: the home page loads within 5 seconds, starting the path opens Install with a running agent, and a Tracing request ends with "Backend joined trace" (`monitors/journey.js`) |
| Agent Playground - Synthetic checks | Alert policy | One incident per monitor |
| A synthetic check failed | NRQL alert condition | Fires when any check of an `Agent Playground - ` monitor fails |
| Agent Playground alert email | Email destination and channel | Sends to `ALERT_EMAIL`. Shared by the synthetic and host-health workflows. |
| Agent Playground - Synthetic check alerts | Alert workflow | Emails every issue from the synthetic policy, when it opens and when it closes |
| Agent Playground - Host health | Alert policy | The browser.nru.to host |
| Host memory nearly full | NRQL alert condition | Fires when the host's `memoryUsedPercent` stays above `MEMORY_PERCENT` (90) for 5 minutes — the condition that OOM-killed the box on 2026-10-28 |
| Agent Playground - Host health alerts | Alert workflow | Emails every issue from the host-health policy, when it opens and when it closes |
| Agent Playground API - Latency | Service level (APM app) | 95% of web requests answered in under 0.5 seconds, over 7 days |
| Agent Playground API - Success | Service level (APM app) | 99% of web requests end without an unexpected error, over 7 days. Leaves out `/api/fail`, which fails on purpose. |
| Agent Playground Browser - Latency (LCP) | Service level (browser app) | 95% of page loads have a Largest Contentful Paint under 2.5 seconds, over 7 days |
| Agent Playground Browser - Availability (AJAX) | Service level (browser app) | 99% of the pages' AJAX requests get an answer (not a 5xx or a network failure), over 7 days. Leaves out `/api/fail`. |
| Agent Playground | Workload | The browser app, the APM app, and any monitor, dashboard or service level named `Agent Playground…` |

The monitors run every hour from two locations.

The browser availability service level uses AJAX requests, not the usual measure of JavaScript errors per page view, because the demo pages throw errors on purpose: on that measure the site would always sit around 65%. For the same reason, both availability service levels leave out the Tracing page's **fail** button. They show whether the site works, not how often learners press it. The Vitals page's slow LCP and the Tracing page's slow request still count, so learners can watch them spend the error budget. The journey signs in as **Synthetic check**, and the learning-path dashboard leaves that user out so the checks don't count as visitors.

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
| `ALERT_EMAIL` | `demo@newrelicuniversity.com` | `synthetics.sh`, `alerts.sh` |
| `SITE_URL` | `https://browser.nru.to` | `synthetics.sh` |
| `MONITOR_LOCATIONS` | `US_WEST_1,US_EAST_1` | `synthetics.sh` |
| `HOST_NAME` | `browser.nru.to` | `alerts.sh` (the host's `NRIA_DISPLAY_NAME`) |
| `MEMORY_PERCENT` | `90` | `alerts.sh` |
| `BROWSER_ENTITY_GUID`, `APM_ENTITY_GUID` | this site's two apps | `workload.sh` |

Because existing items are never changed, a setting only applies to items the script creates. For example, to send alerts to a new address: delete the **Agent Playground alert email** destination in New Relic (its channel and workflow with it, if New Relic asks), then run `synthetics.sh` with the new `ALERT_EMAIL`.

## Changing what gets created

- **A dashboard:** edit its JSON in `dashboards/` (export it from New Relic, or edit by hand), then delete the dashboard in New Relic and run `dashboards.sh`.
- **A monitor script:** edit `monitors/*.js`. `__SITE_URL__` is replaced with `SITE_URL` when the monitor is created. Then delete the monitor and run `synthetics.sh`.
- **Names:** the workload and the alert condition find monitors by their `Agent Playground - ` prefix, and dashboards by `Agent Playground`. Keep those prefixes when renaming.
