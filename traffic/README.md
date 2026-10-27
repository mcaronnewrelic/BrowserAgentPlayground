# Simulated visitors

`simulate.js` sends realistic-looking traffic to the demo site, so the New Relic data and dashboards have something in them between real visits. Each visitor is a real browser (Chromium, Firefox or WebKit through Playwright) with a desktop or phone profile:

| Profile | Engine | Share |
| --- | --- | --- |
| Chrome on desktop | Chromium | 35% |
| Edge on desktop | Chromium | 12% |
| Firefox on desktop | Firefox | 10% |
| Safari on desktop | WebKit | 13% |
| Safari on iPhone | WebKit (iPhone 14) | 18% |
| Chrome on Android | Chromium (Pixel 7) | 12% |

A visitor signs in with a name ("Ada from Platform", "Ben (SRE)", ...) and a session code starting `SIM-`. They follow the learning path through the Up next links, leave after any page about one time in six, and sometimes skip ahead. On each page they click a few of the Try it buttons (rage-clicking on Frustration) and answer the Check yourself questions; some visitors get more of them right than others. Visits are spread out at random, and there are fewer overnight, Pacific time.

## Running it

It runs as the `traffic` service in `compose.yaml`, alongside the site and the infrastructure agent:

```bash
NEW_RELIC_LICENSE_KEY=your_ingest_key docker compose up -d --build
docker compose logs -f traffic
```

Each visit logs its visitor, profile and the pages they reached. To run the site without simulated visitors: `docker compose up -d app newrelic-infra`.

## Settings

Set these in the environment or in `.env` next to `compose.yaml`:

| Variable | Default | What it does |
| --- | --- | --- |
| `TRAFFIC_SITE_URL` | `https://browser.nru.to` | The site to visit. |
| `TRAFFIC_VISITS_PER_HOUR` | `30` | Average visits per hour at the busiest time of day. |
| `TRAFFIC_CONCURRENCY` | `2` | Visits running at once. |

By default visitors go through the public site, not the `app` container directly, so their data goes through Caddy and looks like any other visit.

For a quick test, `VISITS` stops after that many visits and `TIME_SCALE` shortens every pause (0.05 makes them 20 times shorter):

```bash
docker compose run --rm -e VISITS=4 -e TIME_SCALE=0.05 traffic
```

To try it against the site running on your own machine, use `TRAFFIC_SITE_URL=http://host.docker.internal:3000`. Don't use `http://app:3000`: WebKit can't resolve Compose service names, so the Safari visits fail.

## Finding or excluding simulated visits

Every simulated visitor's session code starts with `SIM-`, so queries can include or leave them out:

```sql
SELECT count(*) FROM PageView WHERE demoCode LIKE 'SIM-%' SINCE 1 day ago
SELECT count(*) FROM PageView WHERE demoCode NOT LIKE 'SIM-%' SINCE 1 day ago
```

The Playwright version in `package.json` must match the image in `Dockerfile` (`mcr.microsoft.com/playwright:v1.64.0-noble`); update both together.
