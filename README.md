# BrowserLogsDemo

Self-serve demo pages for the New Relic browser agent (Pro+SPA). Each visitor gets a session code so they can find their own data in a shared account.

- [Home](https://mcaronnewrelic.github.io/BrowserLogsDemo/) (`index.html`): the entry point. Explains what this site is and links out to every demo below.
- [Logs demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/logs.html) (`logs.html`): console auto-logging, `newrelic.log()`, `newrelic.wrapLogger()`, and how log verbosity filters events.
- [Errors demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/errors.html) (`errors.html`): uncaught errors and promise rejections, `newrelic.noticeError()`, `newrelic.setErrorHandler()` for ignoring and grouping, `newrelic.addRelease()`, and how errors relate to ERROR logs.
- [Tracing demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/tracing.html) (`tracing.html`): distributed tracing from the browser. It shows the `traceparent`, `tracestate` and `newrelic` headers the agent adds to each request, and builds a query from your own trace IDs. Each request also writes a browser log with `trace.id`, and the backend logs with `recordLogEvent()`, so browser and server logs appear together on the trace. It runs browser-only out of the box (using `data/*.json`) and becomes full stack when connected to the APM-instrumented API in [`backend/`](backend/README.md).

- [Core Web Vitals demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/vitals.html) (`vitals.html`): makes LCP (a slow hero image), CLS (late banners) and INP (blocking click handlers) good or poor on purpose, with a live scorecard. Results land in `PageViewTiming`, tagged with `demoCode`, `lcpMode` and `clsMode`.

- [Interactions demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/interactions.html) (`interactions.html`): triggers the browser agent's rage click, dead click and error click detection on purpose, then builds a query from your own `UserAction` events, tagged with `demoCode`.

- [Actions demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/actions.html) (`actions.html`): compares `newrelic.addPageAction()`, `newrelic.recordCustomEvent()` and the automatic `BrowserInteraction` event. Proves that an AJAX call alone never creates a `BrowserInteraction`, which needs a route (URL) change followed by a DOM update, by triggering both the half-recipe and the full recipe side by side.

- [Replay demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/replay.html) (`replay.html`): shows that session replay masks everything by default, then uses `newrelic.recordReplay()` to force a replay to run and `newrelic.pauseReplay()` to stop one, alongside `nr-unmask`, `nr-block` and `nr-ignore` to demonstrate the privacy controls live.

- [SPA API demo](https://mcaronnewrelic.github.io/BrowserLogsDemo/spa.html) (`spa.html`): takes manual control of SPA tracking with the `newrelic.interaction()` handle (`.save()`, `.ignore()`, `.setName()`, `.actionText()`, `.setAttribute()`, `.end()`) plus the separate top-level calls `setCurrentRouteName()`, `setPageViewName()` and `finished()`, forcing, suppressing and renaming `BrowserInteraction` events instead of relying on the automatic route-change heuristic from `actions.html`.

## Change tracking

`.github/workflows/change-tracking.yml` sends New Relic [change tracking events](https://docs.newrelic.com/docs/change-tracking/overview/) to the browser app, so markers show up on its charts:

- **Deployment** events every time GitHub Pages publishes `main` (version = short commit SHA, with the commit message and a link to the commit).
- **One demo event a day at 9 AM Pacific**, rotating by weekday through Feature Flag, Business Event, Operational and Deployment, so every kind of marker appears. The rotation lives in `.github/scripts/daily-change-event.sh` (tests: `bash .github/scripts/daily-change-event.test.sh`).
- **Run workflow** on the Actions tab sends today's daily event immediately.

It uses the repository secrets `NEW_RELIC_API_KEY` (a User key, `NRAK-...`) and `NEW_RELIC_DEPLOYMENT_ENTITY_GUID`. To see the events, open the browser app in New Relic and look for the markers on its charts or the **Change tracking** view, or run:

```sql
SELECT timestamp, category, type, shortDescription, user FROM ChangeTrackingEvent SINCE 1 week ago
```

GitHub pauses scheduled workflows after 60 days without commits to the repository; re-enable it from the Actions tab if that happens.

All pages share the same browser snippet. If you change Application settings that live in the snippet (for example, CORS allowed origins for tracing), re-copy the snippet into every page.
