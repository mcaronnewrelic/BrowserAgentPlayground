# BrowserLogsDemo

Self-serve demo pages for the New Relic browser agent (Pro+SPA). Each visitor gets a session code so they can find their own data in a shared account.

- [Home](https://mcaronnewrelic.github.io/BrowserLogsDemo/) (`index.html`): the entry point. Explains what this site is and links out to every demo below.
- [Logs demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/logs.html) (`logs.html`): console auto-logging, `newrelic.log()`, `newrelic.wrapLogger()`, and how log verbosity filters events.
- [Errors demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/errors.html) (`errors.html`): uncaught errors and promise rejections, `newrelic.noticeError()`, `newrelic.setErrorHandler()` for ignoring and grouping, `newrelic.addRelease()`, and how errors relate to ERROR logs.
- [Tracing demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/tracing.html) (`tracing.html`): distributed tracing from the browser. It shows the `traceparent`, `tracestate` and `newrelic` headers the agent adds to each request, and builds a query from your own trace IDs. Each request also writes a browser log with `trace.id`, and the backend logs with `recordLogEvent()`, so browser and server logs appear together on the trace. It runs browser-only out of the box (using `data/*.json`) and becomes full stack when connected to the APM-instrumented API in [`backend/`](backend/README.md).

- [WebSockets demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/websockets.html) (`websockets.html`): turns on WebSocket tracking (`init.web_sockets.enabled`, set on this page only) and opens sockets to an echo server on purpose: a clean close, a custom close code, a connection that never opens, an error thrown in a message handler (only `addEventListener` handlers are linked to the socket through `socketId`), and a socket left open when the page reloads. It shows the agent's running tally for each socket, then queries the `WebSocket` events, one per connection, sent when it closes. On GitHub Pages it uses the public `wss://echo.websocket.org`. When the pages are served by [`backend/`](backend/README.md), it uses the backend's own `/ws` endpoint, which repeats your close reason and logs each connection to New Relic. Add `?ws=wss://your-server` to use any other server.

- [Core Web Vitals demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/vitals.html) (`vitals.html`): makes LCP (a slow hero image), CLS (late banners) and INP (blocking click handlers) good or poor on purpose, with a live scorecard. Results land in `PageViewTiming`, tagged with `demoCode`, `lcpMode` and `clsMode`.

- [Marks & measures demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/measures.html) (`measures.html`): times things with `performance.mark()`, `performance.measure()` and `newrelic.measure()`, shows the browser's performance timeline live, and finds the resulting `BrowserPerformance` events (`entryName`, `entryType`, `entryDuration`, and `entryDetail.*` from `detail`). Marks and measures are only captured because `nr-init.js` turns on `init.performance.capture_marks` and `capture_measures`, and the agent takes every mark on the page, including ones made by scripts other than yours.

- [Frustration demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/frustration.html) (`frustration.html`): triggers the browser agent's rage click, dead click and error click detection on purpose, then builds a query from your own `UserAction` events, tagged with `demoCode`.

- [Events demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/events.html) (`events.html`): compares `newrelic.addPageAction()`, `newrelic.recordCustomEvent()` and the automatic `BrowserInteraction` event. Proves that an AJAX call alone never creates a `BrowserInteraction`, which needs a route (URL) change followed by a DOM update, by triggering both the half-recipe and the full recipe side by side.

- [Replay demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/replay.html) (`replay.html`): shows that session replay masks everything by default, then uses `newrelic.recordReplay()` to force a replay to run and `newrelic.pauseReplay()` to stop one, alongside `nr-unmask`, `nr-block` and `nr-ignore` to demonstrate the privacy controls live.

- [SPA API demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/spa.html) (`spa.html`): takes manual control of SPA tracking with the `newrelic.interaction()` handle (`.save()`, `.ignore()`, `.setName()`, `.actionText()`, `.setAttribute()`, `.end()`) plus the separate top-level calls `setCurrentRouteName()`, `setPageViewName()` and `finished()`, forcing, suppressing and renaming `BrowserInteraction` events instead of relying on the automatic route-change heuristic from `events.html`.

## Change tracking

`.github/workflows/change-tracking.yml` sends New Relic [change tracking events](https://docs.newrelic.com/docs/change-tracking/overview/) to the APM app behind browser.nru.to. The browser app is related to that APM app, so it shows them as related changes:

- **Deployment** events every time GitHub Pages publishes `main` (version = short commit SHA, with the commit message and a link to the commit).
- **One demo event a day**, sent around 9 AM Pacific (GitHub may start it hours late), rotating by weekday through Feature Flag, Business Event, Operational and Deployment, so every kind of marker appears. The rotation lives in `.github/scripts/daily-change-event.sh` (tests: `bash .github/scripts/daily-change-event.test.sh`).
- **Run workflow** on the Actions tab sends today's daily event immediately.

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
3. **Find it**: where the data shows up in New Relic, and NRQL to query it.
4. **Check yourself**: two questions with answers hidden until opened.

### Knowledge check answers and dashboard

Each **Check yourself** question is multiple choice. Every pick is recorded with `newrelic.recordCustomEvent()` as a `DemoQuizAnswer` event (`site.js`), carrying `questionId`, `question`, `answer`, `outcome` (`correct` or `incorrect`), `attempt` (1 for a first try; a wrong pick can be retried) and `demoPage`, plus the usual `demoCode` and `demoUser`. Only the option picked is recorded, never free text. Question IDs (`data-qid`) are meant to stay the same when a question is reworded, so its history carries over.

`dashboards/knowledge-checks.json` is a ready-made dashboard: first-try accuracy overall, by page and by question (hardest first), the most-picked wrong answers, and tries needed to get each question right. To add it, open **Dashboards** in New Relic, choose **Import dashboard**, and paste the file's contents. Its queries use account `6932347`, the one in `nr-config.js`. If your data goes to another account (for example the Docker image with your own license key), change `accountIds` first.

```sql
SELECT percentage(count(*), WHERE outcome = 'correct') FROM DemoQuizAnswer WHERE attempt = 1 FACET question SINCE 1 week ago
```

Timing ("why does it take a minute?") and the map of which feature writes which event type, and where it appears in the UI, live once on `install.html` (`#timing`). Other pages link there instead of repeating it.

To add a page: copy a demo page such as `events.html`, change its content, page-specific styles and script, then add it to `PAGES` in `site.js` and add a card for it to `index.html`. Keep its pure functions between `/*LOGIC-START*/` and `/*LOGIC-END*/`: `backend/page-logic.test.js` loads them from the page and checks every `build…Nrql` function automatically.

All pages share one browser snippet, split into three files so you edit it once:

- `nr-config.js`: your account (`loader_config` and `info`). **This is the only file to edit to report to a different account.**
- `nr-init.js`: the demo's agent settings (session replay, distributed tracing, privacy, marks and measures).
- `nr-agent.js`: the agent loader. Replace it when you copy a newer snippet.

If you change Application settings that live in the snippet (for example, CORS allowed origins for tracing), re-copy the two lines into `nr-config.js`.

### Your name and session code

The home page asks for a name (required, it becomes the end-user ID via `setUserId()`) and a session code. `demo-identity.js` keeps both in `sessionStorage`, so every page in the same tab reuses them. A page opened without them sends you to the home page first and brings you back afterward. A new tab starts empty. Tests: `node --test backend/demo-identity.test.js`.

### Run it in Docker (pages and API on one origin)

```bash
docker build -t browser-agent-playground .
docker run -p 3000:3000 -e NEW_RELIC_LICENSE_KEY=your_ingest_key browser-agent-playground
```

Then open `http://localhost:3000`. The container serves the pages and the tracing API together, so there is no CORS to set up. The APM agent injects the browser agent, so `nr-config.js` and `nr-agent.js` are not used, and the data goes to the account that owns the license key. The container will not start without `NEW_RELIC_LICENSE_KEY`.
