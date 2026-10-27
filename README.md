# BrowserAgentPlayground

Self-serve demo pages for the New Relic browser agent (Pro+SPA). Each visitor gets a session code so they can find their own data in a shared account.

- [Home](https://mcaronnewrelic.github.io/BrowserAgentPlayground/) (`index.html`): the entry point. Explains what this site is and links out to every demo below.
- [Logs demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/logs.html) (`logs.html`): console auto-logging, `newrelic.log()`, `newrelic.wrapLogger()`, and how log verbosity filters events.
- [Errors demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/errors.html) (`errors.html`): uncaught errors and promise rejections, `newrelic.noticeError()`, `newrelic.setErrorHandler()` for ignoring and grouping, `newrelic.addRelease()`, and how errors relate to ERROR logs.
- [Tracing demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/tracing.html) (`tracing.html`): distributed tracing from the browser. It shows the `traceparent`, `tracestate` and `newrelic` headers the agent adds to each request, and builds a query from your own trace IDs. Each request also writes a browser log with `trace.id`, and the backend logs with `recordLogEvent()`, so browser and server logs appear together on the trace. It is full stack wherever it runs: served by the APM-instrumented API in [`backend/`](backend/README.md) it calls that same server, and anywhere else (GitHub Pages, a local static server) it calls the deployed backend at `https://browser.nru.to` across origins. `?backend=none` switches it to browser-only mode, using `data/*.json`.

- [WebSockets demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/websockets.html) (`websockets.html`): turns on WebSocket tracking (`init.web_sockets.enabled`, set on this page only) and opens sockets to an echo server on purpose: a clean close, a custom close code, a connection that never opens, an error thrown in a message handler (only `addEventListener` handlers are linked to the socket through `socketId`), and a socket left open when the page reloads. It shows the agent's running tally for each socket, then queries the `WebSocket` events, one per connection, sent when it closes. It uses the `/ws` endpoint of [`backend/`](backend/README.md), which repeats your close reason and logs each connection to New Relic: the page's own backend when the backend serves it, or `wss://browser.nru.to/ws` anywhere else, once that server's `/api/health` reports `websocket: true`. If the deployed backend is older or unreachable, the page falls back to the public `wss://echo.websocket.org`. Add `?ws=wss://your-server` to use any other server.

- [Core Web Vitals demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/vitals.html) (`vitals.html`): makes LCP (a slow hero image), CLS (late banners) and INP (blocking click handlers) good or poor on purpose, with a live scorecard. Results land in `PageViewTiming`, tagged with `demoCode`, `lcpMode` and `clsMode`.

- [Marks & measures demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/measures.html) (`measures.html`): times things with `performance.mark()`, `performance.measure()` and `newrelic.measure()`, shows the browser's performance timeline live, and finds the resulting `BrowserPerformance` events (`entryName`, `entryType`, `entryDuration`, and `entryDetail.*` from `detail`). Marks and measures are only captured because `nr-init.js` turns on `init.performance.capture_marks` and `capture_measures`, and the agent takes every mark on the page, including ones made by scripts other than yours.

- [Frustration demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/frustration.html) (`frustration.html`): triggers the browser agent's rage click, dead click and error click detection on purpose, then builds a query from your own `UserAction` events, tagged with `demoCode`.

- [Events demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/events.html) (`events.html`): compares `newrelic.addPageAction()`, `newrelic.recordCustomEvent()` and the automatic `BrowserInteraction` event. Proves that an AJAX call alone never creates a `BrowserInteraction`, which needs a route (URL) change followed by a DOM update, by triggering both the half-recipe and the full recipe side by side.

- [Replay demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/replay.html) (`replay.html`): shows that session replay masks everything by default, then uses `newrelic.recordReplay()` to force a replay to run and `newrelic.pauseReplay()` to stop one, alongside `nr-unmask`, `nr-block` and `nr-ignore` to demonstrate the privacy controls live.

- [SPA API demo](https://mcaronnewrelic.github.io/BrowserAgentPlayground/spa.html) (`spa.html`): takes manual control of SPA tracking with the `newrelic.interaction()` handle (`.save()`, `.ignore()`, `.setName()`, `.actionText()`, `.setAttribute()`, `.end()`) plus the separate top-level calls `setCurrentRouteName()`, `setPageViewName()` and `finished()`, forcing, suppressing and renaming `BrowserInteraction` events instead of relying on the automatic route-change heuristic from `events.html`.

## Dashboards, synthetic checks, alerts and workload

`newrelic/` holds scripts that create the site's dashboards, three hourly synthetic checks on browser.nru.to (availability, the backend's health, and an end-to-end journey with a load-time budget), an email alert when any check fails, and the **Agent Playground** workload. They use the same `NEW_RELIC_API_KEY` secret as change tracking, only create what is missing, and run either from the **New Relic setup** workflow or from your own shell. To restore something changed by hand, delete it in New Relic and run them again. See [newrelic/README.md](newrelic/README.md).

## Change tracking

`.github/workflows/change-tracking.yml` sends New Relic [change tracking events](https://docs.newrelic.com/docs/change-tracking/overview/) to the APM app behind browser.nru.to. The browser app is related to that APM app, so it shows them as related changes:

- **Deployment** events every time GitHub Pages publishes `main` (version = short commit SHA, with the commit message and a link to the commit).
- **One demo event a day**, sent around 9 AM Pacific (GitHub may start it hours late), rotating by weekday through Feature Flag, Business Event, Operational and Deployment, so every kind of marker appears. The rotation lives in `.github/scripts/daily-change-event.sh` (tests: `bash .github/scripts/daily-change-event.test.sh`).
- **Run workflow** on the Actions tab sends today's daily event immediately.
- **A server deploy marker, by hand.** GitHub Pages publishing doesn't change the server at browser.nru.to, so after you redeploy it, run the workflow with **event** set to `server-deploy` and the version you deployed: `gh workflow run change-tracking.yml -f event=server-deploy -f version=<image tag or commit>`. Without a version, it uses the current commit.

It uses the repository secrets `NEW_RELIC_API_KEY` (a User key, `NRAK-...`) and `NEW_RELIC_DEPLOYMENT_ENTITY_GUID`, which holds the APM app's entity GUID. To see the events, open the APM app (or the browser app's related changes) in New Relic and look for the markers on its charts or the **Change tracking** view, or run:

```sql
SELECT timestamp, category, type, shortDescription, user FROM ChangeTrackingEvent SINCE 1 week ago
```

GitHub pauses scheduled workflows after 60 days without commits to the repository; re-enable it from the Actions tab if that happens.

## How the pages are built

The pages are plain HTML with no build step, so GitHub Pages and the Node server (`backend/`) serve the same files. What every page shares lives in three files:

- `site.css`: the shared styles (colors, header, buttons, cards, activity feed, query sections, footer, phone layout). Each page's own `<style>` block comes after it and holds only that page's styles.
- `site.js`: the header with the page switcher (the list of pages is `PAGES` at the top), the "Your data is tagged as" panel, and the helpers every demo uses. A page calls `Demo.header()`, `Demo.whoSummary()` and `Demo.identityForm()` from small inline `<script>` tags where that markup belongs. They write it while the page loads, so nothing shifts afterward. The page's own script then calls `Demo.start({ state, onIdentity, onAgent })`, which wires up the name and code fields, the copy buttons and the agent badge, sets the `demoUser` and `demoCode` custom attributes, and calls `onIdentity(nr)` whenever they change so the page can refresh its queries.
- `demo-identity.js`: keeps the name and session code in `sessionStorage` (see below).

Every demo page follows the same learning shape:

1. A **primer** at the top of "Try it": what you'll learn, whether the feature is automatic or needs your code, and a **Before you start** list of what the page needs, each tagged with where that setting lives (on by default, the snippet's `NREUM.init`, Application settings, agent version or backend).
2. The hands-on cards and activity feed.
3. **Find it**, in three steps: **See it in New Relic** (where it appears in the UI, or a plain note that it has no page and goes on a dashboard), **Query it** (NRQL with a "You should see" line for each query), and **Didn't see it?** (troubleshooting tips). Queries follow one convention, checked by `backend/page-logic.test.js`: your own data with `SINCE 1 hour ago`, everyone's with `SINCE 1 day ago`, listings capped at `LIMIT 100`, and no `ORDER BY` (raw rows already come back newest first). Replay runs its query first, because the query gives you the session to look for.
4. **Check yourself**: two multiple-choice questions.
5. **Up next**: a link to the next page on the learning path.

### Knowledge check answers and dashboard

Each **Check yourself** question is multiple choice. Every pick is recorded with `newrelic.recordCustomEvent()` as a `DemoQuizAnswer` event (`site.js`), carrying `questionId`, `question`, `answer`, `outcome` (`correct` or `incorrect`), `attempt` (1 for a first try; a wrong pick can be retried) and `demoPage`, plus the usual `demoCode` and `demoUser`. Only the option picked is recorded, never free text. Question IDs (`data-qid`) are meant to stay the same when a question is reworded, so its history carries over.

`newrelic/dashboards/knowledge-checks.json` is a ready-made dashboard: first-try accuracy overall, by page and by question (hardest first), the most-picked wrong answers, and tries needed to get each question right. `newrelic/dashboards.sh` creates it if it's missing (see [newrelic/README.md](newrelic/README.md)); you can also import it by hand under **Dashboards → Import dashboard**. Its queries use account `6932347`, the one in `nr-config.js`. If your data goes to another account (for example the Docker image with your own license key), change `accountIds` first.

`newrelic/dashboards/learning-path.json` shows how visitors move through the learning path: a funnel of sessions reaching each of the six stages in order, page views by page, and the last page each session viewed (where people drop off). Its queries also filter on the browser app (`appId = 1117825756`); change that too if you report to another app. If you add or move a page in `PAGES` in `site.js`, update the funnel's stage conditions to match.

```sql
SELECT percentage(count(*), WHERE outcome = 'correct') FROM DemoQuizAnswer WHERE attempt = 1 FACET question SINCE 1 week ago
```

Timing ("why does it take a minute?") and the map of which feature writes which event type, and where it appears in the UI, live once on `install.html` (`#timing`). Other pages link there instead of repeating it.

The pages form a learning path in six stages: start here (Install), what you get for free (Vitals, Errors, Frustration), what you add (Logs, Events, Measures), follow the network (Tracing, WebSockets), single-page apps (SPA) and privacy (Replay). `PAGES` in `site.js` holds that order, each page's stage and a one-line hook. It drives the header's page switcher and the **Up next** link that `Demo.upNext()` writes at the end of every page. The home page shows the same stages, and a first-time visitor starts at Install.

To add a page: copy a demo page such as `events.html`, change its content, page-specific styles and script, then add it to `PAGES` in `site.js` at its place in the path, and add its card to the matching stage in `index.html`. Keep its pure functions between `/*LOGIC-START*/` and `/*LOGIC-END*/`: `backend/page-logic.test.js` loads them from the page and checks every `build…Nrql` function automatically.

All pages share one browser snippet, split into three files so you edit it once:

- `nr-config.js`: your account (`loader_config` and `info`). **This is the only file to edit to report to a different account.**
- `nr-init.js`: the demo's agent settings (session replay, distributed tracing, privacy, marks and measures).
- `nr-agent.js`: the agent loader. Replace it when you copy a newer snippet.

If you change Application settings that live in the snippet (for example, CORS allowed origins for tracing), re-copy the two lines into `nr-config.js`.

### Your name and session code

The home page asks for a name (required, it becomes the end-user ID via `setUserId()`) and a session code. `demo-identity.js` keeps both in `sessionStorage`, so every page in the same tab reuses them. A page opened without them sends you to the home page first and brings you back afterward. A new tab starts empty. Tests: `node --test backend/demo-identity.test.js`.

### Preview the pages locally

The pages are static files, so any web server works. From the repository folder:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. Use port 8080: the deployed backend at browser.nru.to allows `http://localhost:8080` by default, so the Tracing and WebSockets pages can reach it from your machine. The pages report to the account in `nr-config.js`, the same as on GitHub Pages. Opening the files directly (`file://`) doesn't work, because the pages fetch other files and keep your name and code in `sessionStorage`.

If nothing reaches New Relic, check that your network or an ad blocker isn't blocking `js-agent.newrelic.com` (where most of the agent's code loads from) or `bam.nr-data.net` (where it sends data). The Install page's request list shows whether anything is being sent.

To run the tests: `cd backend && npm test` (Node 24, no install needed).

### Run it in Docker (pages and API on one origin)

```bash
NEW_RELIC_LICENSE_KEY=your_ingest_key docker compose up -d --build
```

`compose.yaml` runs three containers:

- `app`: the pages and API on port 3000.
- `newrelic-infra`: the New Relic infrastructure agent for the host and its containers. It reports the host as `browser.nru.to` (set `INFRA_DISPLAY_NAME` to change that) with the tag `project=agent-playground`, which is how the Agent Playground workload finds it.
- `traffic`: simulated visitors in real Chromium, Firefox and WebKit browsers. See [traffic/README.md](traffic/README.md).

You can put the license key in a `.env` file next to `compose.yaml` instead (it is ignored by git). To run only the site: `docker compose up -d app`. Without Compose:

```bash
docker build -t browser-agent-playground .
docker run -p 3000:3000 -e NEW_RELIC_LICENSE_KEY=your_ingest_key browser-agent-playground
```

Then open `http://localhost:3000`. The container serves the pages and the tracing API together, so there is no CORS to set up. The APM agent injects the browser agent, so `nr-config.js` and `nr-agent.js` are not used, and the data goes to the account that owns the license key. The container will not start without `NEW_RELIC_LICENSE_KEY`.

### Deploy to browser.nru.to (EC2)

browser.nru.to is an EC2 server running this repository's `compose.yaml`, with [Caddy](https://caddyserver.com/) on the host in front of it. Caddy gets the HTTPS certificate and forwards requests to the `app` container. Port 3000 is published only on `127.0.0.1`, so the app can't be reached directly from the internet; everything goes through Caddy.

```text
visitor ──HTTPS 443──> Caddy (host) ──> 127.0.0.1:3000 ──> app container
```

#### One-time setup

1. **Security group.** Allow inbound 80 and 443 from anywhere (Caddy needs 80 to get and renew its certificate) and 22 only from your own IP. Don't open 3000.
2. **Install** Docker with the Compose plugin (`docker compose version` should work), git and Caddy.
3. **Clone the repository:**

   ```bash
   git clone https://github.com/mcaronnewrelic/BrowserAgentPlayground.git
   cd BrowserAgentPlayground
   ```

4. **Create the settings file** outside the repository, readable only by root, and link it as the `.env` Compose reads. `.env` is ignored by git and Docker, so the key is never committed or copied into an image.

   ```bash
   sudo install -m 600 /dev/null /etc/browser-agent-playground.env
   sudo nano /etc/browser-agent-playground.env      # NEW_RELIC_LICENSE_KEY=your_ingest_key
   sudo ln -s /etc/browser-agent-playground.env .env
   ```

   One `KEY=value` per line, without quotes. Only the variables `compose.yaml` names are used: `NEW_RELIC_LICENSE_KEY` (required), `ALLOWED_ORIGINS`, `INFRA_DISPLAY_NAME` and the `TRAFFIC_*` settings in [traffic/README.md](traffic/README.md). Without the link, add `--env-file /etc/browser-agent-playground.env` to every `docker compose up`, `down` and `run`.
5. **Configure Caddy.** Put this in `/etc/caddy/Caddyfile`:

   ```caddyfile
   browser.nru.to {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   That is the whole configuration. Caddy gets and renews the Let's Encrypt certificate for the name by itself (the DNS record must already point at the server), redirects HTTP to HTTPS, passes WebSocket upgrades for `/ws` through, and sends `X-Forwarded-For` and `X-Forwarded-Proto`. Use `127.0.0.1` rather than the server's IP, because that is the only address the app listens on. Check and apply it:

   ```bash
   caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

6. **Start everything:**

   ```bash
   sudo docker compose up -d --build
   ```

   Containers restart by themselves after a crash or a reboot (`restart: unless-stopped`), as long as Docker starts at boot (`sudo systemctl enable docker`).

#### Deploy an update

From the repository folder on the server:

```bash
git pull
sudo docker compose up -d --build
```

There's no need to stop anything or clone again. Compose rebuilds the images and replaces only the containers whose image or settings changed; the others keep running. If `git pull` refuses because of local changes on the server, discard them with `git fetch && git reset --hard origin/main`.

Then check it:

```bash
sudo docker compose ps                            # all three running
curl -s https://browser.nru.to/api/health         # "ok":true, "apm":true, "websocket":true
sudo docker compose logs --tail 20 traffic        # visits completing several pages
```

Finally, record the deploy in New Relic with the commit you deployed (see [Change tracking](#change-tracking)):

```bash
gh workflow run change-tracking.yml -f event=server-deploy -f version=$(git rev-parse --short HEAD)
```

Old images pile up after many builds; `sudo docker image prune -f` removes the ones no container uses.

#### Roll back

Check out the last good commit and rebuild. Run `git switch main` and `git pull` to go forward again later.

```bash
git log --oneline -5
git checkout <commit>
sudo docker compose up -d --build
```

#### Troubleshooting

- **502 from Caddy:** the app isn't answering on `127.0.0.1:3000`. Check `sudo docker compose ps` and `sudo docker compose logs app`. A missing license key stops it with "Set NEW_RELIC_LICENSE_KEY…".
- **Certificate errors:** `sudo journalctl -u caddy --since "1 hour ago"`. Usually the DNS record doesn't point at the server yet, or port 80 is closed.
- **Is 3000 private?** `sudo ss -tlnp | grep 3000` should show `127.0.0.1:3000`. From another machine, `curl -m 5 http://<server IP>:3000/` should fail.
