# BrowserAgentPlayground

Hands-on demo pages for the [New Relic browser agent](https://docs.newrelic.com/docs/browser/browser-monitoring/getting-started/introduction-browser-monitoring/). Each page makes one agent feature happen on purpose (an error, a rage click, a slow LCP, a WebSocket), then shows where to find it in New Relic and how to query it. Visitors enter a name and get a session code, so they can find their own data in a shared account.

The pages need the Pro+SPA agent, the full version of the browser agent.

**Try it:** [GitHub Pages](https://mcaronnewrelic.github.io/BrowserAgentPlayground/) or [browser.nru.to](https://browser.nru.to/).

## Where it runs

The same HTML files are served in two places:

| | GitHub Pages | browser.nru.to |
| --- | --- | --- |
| Serves | The static files, published from `main` | The Node server in [`backend/`](backend/README.md), on an EC2 host behind Caddy |
| Browser agent | The snippet in `nr-config.js`, `nr-init.js` and `nr-agent.js` | Injected by the server's APM agent |
| Backend for Tracing and WebSockets | browser.nru.to, across origins | The same server |
| Deployed by | Pushing site files to `main` (the `Deploy site to Pages` workflow; pushes that touch only `backend/`, `newrelic/`, `exercises/`, docs and the like are skipped) | `git pull` and `docker compose up` on the server ([how](#deploy-to-browsernruto-ec2)) |

Both report to the same browser app, which is linked to the server's APM app.

## The pages

The pages form a learning path in six stages. Each page ends with an **Up next** link to the next one, and a first-time visitor starts at Install.

| Stage | Page | What it shows |
| --- | --- | --- |
| | [Home](https://mcaronnewrelic.github.io/BrowserAgentPlayground/) (`index.html`) | What the site is, your name and session code, and every page by stage. |
| Start here | [Install](https://mcaronnewrelic.github.io/BrowserAgentPlayground/install.html) (`install.html`) | The three ways to install the agent (copy/paste snippet, APM injection, npm), why data takes a minute to appear, and which feature writes which event type. |
| What you get for free | [Core Web Vitals](https://mcaronnewrelic.github.io/BrowserAgentPlayground/vitals.html) (`vitals.html`) | Makes LCP (a slow hero image), CLS (late banners) and INP (blocking click handlers) good or poor on purpose, with a live scorecard. Results land in `PageViewTiming`. |
| | [Errors](https://mcaronnewrelic.github.io/BrowserAgentPlayground/errors.html) (`errors.html`) | Uncaught errors and promise rejections, `noticeError()`, `setErrorHandler()` for ignoring and grouping, `addRelease()`, and how errors relate to ERROR logs. |
| | [Frustration](https://mcaronnewrelic.github.io/BrowserAgentPlayground/frustration.html) (`frustration.html`) | Triggers rage click, dead click and error click detection, then queries your `UserAction` events. |
| What you add | [Logs](https://mcaronnewrelic.github.io/BrowserAgentPlayground/logs.html) (`logs.html`) | Console auto-logging, `log()`, `wrapLogger()`, and how log verbosity filters events. |
| | [Events](https://mcaronnewrelic.github.io/BrowserAgentPlayground/events.html) (`events.html`) | `addPageAction()` and `recordCustomEvent()` compared with the automatic `BrowserInteraction`. It shows that an AJAX call alone never creates a `BrowserInteraction`: that needs a route change followed by a DOM update. |
| | [Marks & measures](https://mcaronnewrelic.github.io/BrowserAgentPlayground/measures.html) (`measures.html`) | `performance.mark()`, `performance.measure()` and `newrelic.measure()`, the live performance timeline, and the resulting `BrowserPerformance` events. Captured because `nr-init.js` turns on `performance.capture_marks` and `capture_measures`. |
| Follow the network | [Tracing](https://mcaronnewrelic.github.io/BrowserAgentPlayground/tracing.html) (`tracing.html`) | Distributed tracing from the browser: the `traceparent`, `tracestate` and `newrelic` headers on each request, browser and server logs on the same trace, and a query built from your trace IDs. Add `?backend=none` for browser-only mode, which uses `data/*.json`. |
| | [WebSockets](https://mcaronnewrelic.github.io/BrowserAgentPlayground/websockets.html) (`websockets.html`) | Turns on WebSocket tracking (`init.web_sockets.enabled`, on this page only) and opens sockets that close cleanly, close with a custom code, never open, throw in a message handler, or stay open across a reload. Then it queries the `WebSocket` events, one per connection. |
| Single-page apps | [SPA API](https://mcaronnewrelic.github.io/BrowserAgentPlayground/spa.html) (`spa.html`) | Manual SPA tracking with the `interaction()` handle (`.save()`, `.ignore()`, `.setName()`, `.end()`, ...), `setCurrentRouteName()`, `setPageViewName()` and `finished()`: forcing, suppressing and renaming `BrowserInteraction` events. |
| Privacy | [Replay](https://mcaronnewrelic.github.io/BrowserAgentPlayground/replay.html) (`replay.html`) | Session replay masks everything by default. `recordReplay()` and `pauseReplay()` start and stop it, and `nr-unmask`, `nr-block` and `nr-ignore` show the privacy controls live. |

There's also a standalone **bonus exercise**, `noisy-neighbor.html`, that isn't part of the path above: a guided root-cause investigation that has students trace a slowdown from the app down to a CPU-hogging process on the host. Hand them the link directly. It pairs with [`exercises/noisy-neighbor/`](exercises/noisy-neighbor/README.md), which puts the load on the host.

**Which backend Tracing and WebSockets use:** when the Node server serves a page, the page uses that server. Anywhere else (GitHub Pages, a local static server), it uses `https://browser.nru.to`.

- **WebSockets** first checks that browser.nru.to's `/api/health` reports `websocket: true`. If the server is older or unreachable, it falls back to the public `wss://echo.websocket.org`.
- **To use another server**, add `?ws=wss://your-server` to the WebSockets page.

## What's in the repository

| Path | What it is |
| --- | --- |
| `*.html` | The pages: one per demo, plus `index.html` |
| `site.css`, `site.js` | What every page shares: styles, header, learning path, helpers ([details](#how-the-pages-are-built)) |
| `demo-identity.js` | Keeps your name and session code for the tab |
| `nr-config.js`, `nr-init.js`, `nr-agent.js` | The browser agent snippet, split in three |
| `data/`, `images/`, `favicons/` | Static files the pages use |
| [`backend/`](backend/README.md) | The Node server: serves the pages, the tracing API and the `/ws` WebSocket, with the APM agent. Also all the tests. |
| `Dockerfile`, `compose.yaml` | The server's image, and the three containers browser.nru.to runs |
| [`traffic/`](traffic/README.md) | Simulated visitors in real browsers |
| [`newrelic/`](newrelic/README.md) | Scripts that create the dashboards, synthetic checks, alerts, service levels and workload in New Relic |
| [`account-cleanup/`](account-cleanup/README.md) | Not part of the site: deletes what the shared demo@ login leaves behind in the enablement accounts. Self-contained, to move to its own repository. |
| `.github/` | Workflows for the Pages deploy, tests, change tracking, New Relic setup and account cleanup |

## Run it locally

### Preview the pages

The pages are static files, so any web server works. From the repository folder:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. Use port 8080: the deployed backend at browser.nru.to allows `http://localhost:8080` by default, so the Tracing and WebSockets pages can reach it from your machine. The pages report to the account in `nr-config.js`, the same as on GitHub Pages.

Opening the files directly (`file://`) doesn't work, because the pages fetch other files and keep your name and code in `sessionStorage`.

If nothing reaches New Relic, check that your network or an ad blocker isn't blocking `js-agent.newrelic.com` (where most of the agent's code loads from) or `bam.nr-data.net` (where it sends data). The Install page's request list shows whether anything is being sent.

### Run the server in Docker

To run the pages and the API together, as browser.nru.to does:

```bash
NEW_RELIC_LICENSE_KEY=your_ingest_key docker compose up -d --build app
```

Then open `http://localhost:3000`. The pages and API share one origin, so there is no CORS to set up. The APM agent injects the browser agent, so `nr-config.js` and `nr-agent.js` aren't used, and the data goes to the account that owns the license key. The container won't start without `NEW_RELIC_LICENSE_KEY`. You can put it in a `.env` file next to `compose.yaml` instead (git ignores it).

The `app` at the end starts only the site. A plain `docker compose up` also starts the other two containers in `compose.yaml`, which are meant for the server:

- `newrelic-infra`: the New Relic infrastructure agent. It runs privileged with access to the whole host, and reports it as `browser.nru.to` (set `INFRA_DISPLAY_NAME` to change that) with the tag `project=agent-playground`, which is how the Agent Playground workload finds it.
- `traffic`: simulated visitors. By default they visit the public site, not your local one. See [traffic/README.md](traffic/README.md).

#### Process reporting

The infrastructure agent's `NRIA_INCLUDE_MATCHING_METRICS` allowlist in [compose.yaml](compose.yaml) reports `ProcessSample` only for `node`, `noisy-neighbor`, `caddy`, `dockerd`, `containerd` and `newrelic-infra`. These retain the demo application, the noisy-neighbor culprit and supporting services. The exercise uses `--keep-name` so its stress workers also match `noisy-neighbor`.

Browser workers (including headless Chrome, Firefox and WebKit), `sleep`, shells and other processes are not reported individually. Their resource use still contributes to host and container metrics. The filter matches process names, not container names, so both the app and simulator's Node.js coordinator are retained as `node`. This intentionally trades visibility into other processes for a cleaner investigation.

After pulling the change, recreate only the infrastructure agent (no image rebuild needed):

```bash
sudo docker compose up -d --no-deps newrelic-infra
sudo docker compose logs --tail=50 newrelic-infra
```

Allow a few collection cycles, then check newly reported process names in New Relic:

```sql
SELECT count(*) FROM ProcessSample
WHERE entityName = 'browser.nru.to'
FACET commandName SINCE 5 minutes ago LIMIT MAX
```

Replace the host name if you changed `INFRA_DISPLAY_NAME`. Historical samples remain until retention expires, so the query window must fall entirely after the restart. `noisy-neighbor` appears only while the exercise runs. To restore reporting of all processes, remove `NRIA_INCLUDE_MATCHING_METRICS` and recreate the agent again.

See New Relic's [agent configuration template](https://github.com/newrelic/infrastructure-agent/blob/1.80.5/assets/examples/infrastructure/newrelic-infra-template.yml.example) for the `include_matching_metrics` syntax.

Without Compose:

```bash
docker build -t browser-agent-playground .
docker run -p 3000:3000 -e NEW_RELIC_LICENSE_KEY=your_ingest_key browser-agent-playground
```

To run the server without Docker, see [backend/README.md](backend/README.md).

### Tests

```bash
cd backend && npm test
```

This needs Node 24 and no install. It tests the server, the WebSocket endpoint, the name and session code, and every page's logic, including the NRQL each page builds. On GitHub, the **Checks** workflow runs the same tests on every push and pull request, and also lints the workflows (actionlint) and shell scripts (shellcheck).

## Deploy to browser.nru.to (EC2)

browser.nru.to is an EC2 server running this repository's `compose.yaml`, with [Caddy](https://caddyserver.com/) on the host in front of it. Caddy gets the HTTPS certificate and forwards requests to the `app` container. Port 3000 is published only on `127.0.0.1`, so the app can't be reached directly from the internet. Everything goes through Caddy.

```text
visitor ──HTTPS 443──> Caddy (host) ──> 127.0.0.1:3000 ──> app container
```

### One-time setup

1. **Security group.** Allow inbound 80 and 443 from anywhere (Caddy needs 80 to get and renew its certificate), and 22 only from your own IP. Don't open 3000.
2. **Install** Docker with the Compose plugin, git and Caddy. Install Compose for all users, not just yours, because the commands below run with `sudo`: `sudo docker compose version` should print a version. The server runs Ubuntu, where Compose is its own package:

   ```bash
   sudo apt install docker.io docker-compose-v2 git caddy
   ```

   If Docker came from Docker's own apt repository (`docker-ce`), the Compose package is `docker-compose-plugin` instead. Don't use the Docker snap: it can't read the settings file in `/etc` or give the infrastructure agent the host access it needs. Don't use the old `docker-compose` package either: it's Compose v1 and doesn't add the `docker compose` command.

3. **Clone the repository:**

   ```bash
   git clone https://github.com/mcaronnewrelic/BrowserAgentPlayground.git
   cd BrowserAgentPlayground
   ```

4. **Create the settings file** outside the repository, readable only by root, and link it as the `.env` file Compose reads. Git and Docker both ignore `.env`, so the key is never committed or copied into an image.

   ```bash
   sudo install -m 600 /dev/null /etc/browser-agent-playground.env
   sudo nano /etc/browser-agent-playground.env      # NEW_RELIC_LICENSE_KEY=your_ingest_key
   sudo ln -s /etc/browser-agent-playground.env .env
   ```

   Write one `KEY=value` per line, without quotes. Compose uses only the variables `compose.yaml` names:

   - `NEW_RELIC_LICENSE_KEY` (required)
   - `NEW_RELIC_APP_NAME`: browser.nru.to uses `Browser Agent Playground`. Keep it the same, because a new name makes New Relic start a separate APM app (and browser app), and the change tracking secret and workload point at the existing one.
   - `ALLOWED_ORIGINS`
   - `INFRA_DISPLAY_NAME`
   - the `TRAFFIC_*` settings in [traffic/README.md](traffic/README.md)

   If you skip the link, add `--env-file /etc/browser-agent-playground.env` to every `docker compose up`, `down` and `run`.

5. **Configure Caddy.** Put this in `/etc/caddy/Caddyfile`:

   ```caddyfile
   browser.nru.to {
       reverse_proxy 127.0.0.1:3000
   }
   ```

   That's the whole configuration. Caddy gets and renews the Let's Encrypt certificate for the name by itself, as long as the DNS record already points at the server. It also redirects HTTP to HTTPS, passes WebSocket upgrades for `/ws` through, and sends `X-Forwarded-For` and `X-Forwarded-Proto`. Use `127.0.0.1` rather than the server's IP, because that's the only address the app listens on. Check and apply it:

   ```bash
   caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

6. **Start everything:**

   ```bash
   sudo docker compose up -d --build
   ```

   Containers restart by themselves after a crash or a reboot (`restart: unless-stopped`), as long as Docker starts at boot (`sudo systemctl enable docker`).

### Deploy an update

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

Every build leaves the previous images behind, and the traffic image alone is about 2 GB, so clean up now and then. These remove only images and build cache that no container uses:

```bash
sudo docker system df                                      # what is using the space
sudo docker image prune -a -f && sudo docker builder prune -a -f
```

A 20 GB disk leaves room for a rebuild next to the running images. EC2's default of 8 GB fills up quickly.

### Roll back

Check out the last good commit and rebuild:

```bash
git log --oneline -5
git checkout <commit>
sudo docker compose up -d --build
```

To go forward again later, run `git switch main` and `git pull`, then rebuild.

### Troubleshooting

- **`unknown flag: --env-file` (or `unknown shorthand flag: 'd'`):** Docker can't find the Compose plugin, so `compose` isn't a command it knows. Check `sudo docker compose version`, then install `docker-compose-v2` (or `docker-compose-plugin` with `docker-ce`) as in step 2. If it works without `sudo` but not with it, Compose is installed only for your user (in `~/.docker/cli-plugins`).
- **`no space left on device`:** clean up old images and build cache as in [Deploy an update](#deploy-an-update), then build again. Check with `df -h /`. If it's still nearly full, grow the EBS volume.
- **502 from Caddy:** the app isn't answering on `127.0.0.1:3000`. Check `sudo docker compose ps` and `sudo docker compose logs app`. A missing license key stops it with "Set NEW_RELIC_LICENSE_KEY…".
- **Certificate errors:** run `sudo journalctl -u caddy --since "1 hour ago"`. Usually the DNS record doesn't point at the server yet, or port 80 is closed.
- **Is 3000 private?** `sudo ss -tlnp | grep 3000` should show `127.0.0.1:3000`. From another machine, `curl -m 5 http://<server IP>:3000/` should fail.

## How the pages are built

The pages are plain HTML with no build step, so GitHub Pages and the Node server serve the same files. What every page shares lives in three files:

- `site.css`: the shared styles (colors, header, buttons, cards, activity feed, query sections, quizzes, footer, phone layout). Each page's own `<style>` block comes after it and holds only that page's styles.
- `site.js`: the header with its page switcher, the learning path (`PAGES`), the "Your data is tagged as" panel, and the helpers every demo uses.
  - A page calls `Demo.header()`, `Demo.whoSummary()`, `Demo.identityForm()` and `Demo.upNext()` from small inline `<script>` tags where that markup belongs. They write it while the page loads, so nothing shifts afterward.
  - The page's own script then calls `Demo.start({ state, onIdentity, onAgent })`. It wires up the name and code fields, the copy buttons, the agent badge and the quiz, and sets the `demoUser` and `demoCode` custom attributes. It calls `onIdentity(nr)` whenever they change, so the page can refresh its queries.
- `demo-identity.js`: keeps the name and session code (see [Your name and session code](#your-name-and-session-code)).

### What every page contains

1. A **primer** at the top of "Try it": what you'll learn, whether the feature is automatic or needs your code, and a **Before you start** list of what the page needs. Each item is tagged with where that setting lives: on by default, the snippet's `NREUM.init`, Application settings, agent version or backend.
2. The hands-on cards and activity feed.
3. **Find it**, in three steps:
   - **See it in New Relic:** where it appears in the UI, or a note that it has no page of its own and goes on a dashboard.
   - **Query it:** NRQL with a "You should see" line for each query.
   - **Didn't see it?:** troubleshooting tips.

   Replay puts its query first, because the query gives you the session to look for.
4. **Check yourself**: two multiple-choice questions.
5. **Up next**: a link to the next page on the learning path.

Queries follow one convention, checked by `backend/page-logic.test.js`:

- your own data with `SINCE 1 hour ago`, everyone's with `SINCE 1 day ago`;
- listings capped at `LIMIT 100`;
- no `ORDER BY`: raw rows already come back newest first, and New Relic rejects it on some faceted queries.

Install explains timing ("why does it take a minute?") and which feature writes which event type, and where each appears in the UI (`install.html#timing`). Other pages link there instead of repeating it.

### The learning path

`PAGES` in `site.js` lists every page in path order, with its stage and a one-line hook. It drives the header's page switcher and the **Up next** link at the end of every page. The home page shows the same stages.

### Add a page

1. Copy a demo page such as `events.html`, then change its content, page-specific styles and script.
2. Add it to `PAGES` in `site.js`, at its place in the path.
3. Add its card to the matching stage in `index.html`.
4. Update the learning-path dashboard's funnel to match (see [Dashboards](#dashboards)).

Keep the page's pure functions between `/*LOGIC-START*/` and `/*LOGIC-END*/`. `backend/page-logic.test.js` loads them from the page and checks every `build…Nrql` function automatically.

### The browser agent snippet

All pages share one snippet, split into three files so you edit it in one place:

- `nr-config.js`: the account and app (`loader_config` and `info`).
- `nr-init.js`: the demo's agent settings (session replay, distributed tracing, privacy, marks and measures).
- `nr-agent.js`: the agent loader. Replace it when you copy a newer snippet.

If you change Application settings that live in the snippet (for example, CORS allowed origins for tracing), copy the two lines into `nr-config.js` again.

The Node server swaps this snippet for the one its APM agent provides. On browser.nru.to only `nr-init.js` applies.

### Your name and session code

The home page asks for a name and a session code. The name is required, and becomes the end-user ID through `setUserId()`.

- `demo-identity.js` keeps both in `sessionStorage`, so every page in the same tab reuses them. A new tab starts empty.
- A page opened without them sends you to the home page first, then brings you back.

Every event the agent sends carries them as `demoUser` and `demoCode`.

## Knowledge checks and dashboards

### Knowledge check answers

Every pick in a **Check yourself** question is recorded with `newrelic.recordCustomEvent()` as a `DemoQuizAnswer` event (in `site.js`). Only the option picked is recorded, never free text. Each event carries:

- `questionId`, `question` and `answer`;
- `outcome`: `correct` or `incorrect`;
- `attempt`: 1 for a first try (a wrong pick can be retried);
- `demoPage`, plus the usual `demoCode` and `demoUser`.

Question IDs (`data-qid`) are meant to stay the same when a question is reworded, so its history carries over. For example, first-try accuracy by question:

```sql
SELECT percentage(count(*), WHERE outcome = 'correct') FROM DemoQuizAnswer WHERE attempt = 1 FACET question SINCE 1 week ago
```

### Dashboards

`newrelic/dashboards/` holds two dashboards. `newrelic/dashboards.sh` creates them if they're missing (see below), or you can import one by hand under **Dashboards → Import dashboard**.

- **Knowledge Checks** (`knowledge-checks.json`): first-try accuracy overall, by page and by question (hardest first), the most-picked wrong answers, and the tries needed to get each question right.
- **Learning Path** (`learning-path.json`): how visitors move through the path. It shows a funnel of sessions reaching each of the six stages in order, page views by page, and the last page each session viewed (where people drop off). When you add or move a page in `PAGES`, update the funnel's stage conditions to match.

The learning-path queries filter on the browser app (`appId = 1117825756`) and leave out the synthetic checks' visits (`demoUser = 'Synthetic check'`).

Simulated visitors have session codes starting `SIM-`. To leave them out of your own queries too, add `WHERE demoCode NOT LIKE 'SIM-%'`.

### Reporting to another account

The repository is set up for account `6932347`. To report somewhere else, change:

- `nr-config.js`, for the pages on GitHub Pages or a local static server;
- the license key, for the Docker image (data goes to the key's account);
- `accountIds` in the dashboard JSON (or set `NEW_RELIC_ACCOUNT_ID` when running `dashboards.sh`), and the learning-path dashboard's `appId`;
- the entity GUIDs and account ID the setup scripts and change tracking use (see [newrelic/README.md](newrelic/README.md)).

## New Relic setup: dashboards, synthetic checks, alerts, service levels and workload

The scripts in `newrelic/` create, through the NerdGraph API:

- the two dashboards;
- three hourly synthetic checks on browser.nru.to: availability, the backend's health, and an end-to-end journey with a load-time budget;
- an email alert when any check fails;
- four service levels: latency and success for the APM app, and latency (LCP) and availability (AJAX) for the browser app;
- the **Agent Playground** workload, which groups the browser app, APM app, monitors, dashboards, service levels and the EC2 host.

They create only what is missing, so they're safe to run any time. To restore something changed by hand, delete it in New Relic and run them again. Run them from the **New Relic setup** workflow on the Actions tab, or from your own shell:

```bash
NEW_RELIC_API_KEY=NRAK-... bash newrelic/setup.sh
```

The workflow also runs by itself when anything in `newrelic/` changes on `main`. See [newrelic/README.md](newrelic/README.md) for each script and its settings.

## Change tracking

`.github/workflows/change-tracking.yml` sends New Relic [change tracking events](https://docs.newrelic.com/docs/change-tracking/overview/) to the APM app behind browser.nru.to. The browser app is related to that APM app, so it shows them as related changes.

- **Deployment** events every time GitHub Pages publishes `main`. The version is the short commit SHA, with the commit message and a link to the commit.
- **One demo event a day**, sent around 9 AM Pacific (GitHub may start it hours late). It rotates by weekday through Feature Flag, Business Event, Operational and Deployment, so every kind of marker appears. The rotation lives in `.github/scripts/daily-change-event.sh`, tested by `bash .github/scripts/daily-change-event.test.sh`.
- **Run workflow** on the Actions tab sends today's daily event immediately.
- **A server deploy marker, by hand.** GitHub Pages publishing doesn't change the server, so after you [deploy to browser.nru.to](#deploy-an-update), run the workflow with **event** set to `server-deploy`: `gh workflow run change-tracking.yml -f event=server-deploy -f version=<commit>`. Without a version, it uses the current commit.

The workflow uses two repository secrets:

- `NEW_RELIC_API_KEY`: a User key (`NRAK-...`).
- `NEW_RELIC_DEPLOYMENT_ENTITY_GUID`: the APM app's entity GUID.

To see the events, open the APM app (or the browser app's related changes) in New Relic, and look for the markers on its charts or in the **Change tracking** view. Or run:

```sql
SELECT timestamp, category, type, shortDescription, user FROM ChangeTrackingEvent SINCE 1 week ago
```

GitHub pauses scheduled workflows after 60 days without commits to the repository. If that happens, re-enable the workflow from the Actions tab.
