# Bad deploy (exercise, host side)

A classic incident: a deploy goes out, and an error starts showing up right after. The skill is correlating the error spike with the deployment using New Relic change tracking, then confirming the new error in Errors Inbox.

Two halves make it happen, both keyed to the top of each hour so they line up without coordinating:

- **The backend** (`backend/server.js`) gives `/api/profile` a bug during a window each hour — `BAD_DEPLOY_WINDOW_START` (default minute 30) for `BAD_DEPLOY_WINDOW_MINUTES` (default 15). Inside the window it throws `TypeError: Cannot read properties of undefined (reading 'tier')` for `BAD_DEPLOY_ERROR_RATE` of requests; outside it the endpoint is healthy.
- **This folder** records a deployment marker on the APM app at the start of the window and drives the traffic that triggers the error, so the spike follows the marker.

The window is 15 of every 60 minutes, so it's always inside a default 1-hour query range.

## What's here

| File | What it does |
| --- | --- |
| `mark-and-load.sh` | Records one deployment marker (NerdGraph), then drives traffic to `/api/profile` for the window |
| `setup.sh` | Installs the hourly cron job that runs `mark-and-load.sh` |
| `teardown.sh` | Removes the cron job |

## Requirements

- A New Relic **User key** (`NRAK-...`) allowed to create deployments. Put it in the env file the site already uses (`/etc/browser-agent-playground.env`) as `NEW_RELIC_API_KEY` — the cron job reads it from there, so the key stays on the host and never goes into the app image.
- The marker lands on the APM app named by `NEW_RELIC_DEPLOYMENT_ENTITY_GUID` (defaults to the browser.nru.to APM app), the same GUID change tracking already uses.

## Set it up on the host

From this folder on the EC2 host:

```bash
sudo bash setup.sh
```

Then test one cycle now, without waiting for the hour, with a short load:

```bash
sudo ENV_FILE=/etc/browser-agent-playground.env LOAD_SECONDS=60 bash mark-and-load.sh
```

Watch for the marker on the APM app's **Deployments / Change tracking**, and the `TypeError` in **Errors Inbox**, lined up in time. Remove it all with `sudo bash teardown.sh`.

Keep the cron minute and the backend's `BAD_DEPLOY_WINDOW_START` the same (both default to :30). If you change one, change the other.

## Queries for checking it

```sql
-- The deployment markers
SELECT timestamp, version FROM Deployment SINCE 3 hours ago

-- The new error, by minute, to see it cluster after each marker
SELECT count(*) FROM TransactionError WHERE error.message LIKE "%reading 'tier'%" TIMESERIES SINCE 3 hours ago
```
