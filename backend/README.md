# Tracing demo backend

A tiny Node.js API for `tracing.html`. With the New Relic APM agent attached, browser requests from the demo page continue into this service, so a single trace shows the click, the network request, the API transaction, and its internal calls to `inventory` and `payment`.

There are no dependencies apart from the `newrelic` agent, which loads only when `NEW_RELIC_LICENSE_KEY` is set. Without a key the server still runs, so you can test CORS and the page wiring first.

## Endpoints

| Route | What it does |
| --- | --- |
| `GET /api/health` | Reachability check used by the page's mode badge |
| `GET /api/products`, `GET /api/cart` | Simple JSON responses |
| `POST /api/checkout` | Calls `/internal/inventory` and `/internal/payment` over HTTP, which produces child spans |
| `GET /api/orders/:id` | Order lookup |
| `GET /api/slow?ms=1500` | Waits before responding (capped at 5000 ms) |
| `GET /api/fail` | Returns 500 and reports the error with `noticeError` |
| `GET /ws` (WebSocket) | Echo endpoint for `websockets.html`: one greeting, then every text and binary message comes back. It repeats the client's close code and reason, answers pings, and closes connections idle for 5 minutes or open for 15. Messages are capped at 64 KB. |

Every response includes `trace.received` (the `traceparent`, `tracestate` and `newrelic` headers the server saw) and `trace.apm` (the trace ID from the APM agent). The page compares them to show "Backend joined trace". The `demoCode` and `demoUser` query params are added to each transaction as custom attributes.

## Logs on the trace

Every API request (except health checks) writes one log with `newrelic.recordLogEvent()`. Because it runs inside the request's transaction, the agent adds `trace.id`, `span.id` and `entity.name` automatically, so the log shows up on the trace next to the browser's logs. `POST /api/checkout` writes three logs (inventory, payment, checkout), each with its own `span.id` on the same `trace.id`. Levels: INFO for 2xx, WARN for 4xx, and ERROR for 5xx (with `error.message` and `error.class`).

Each WebSocket connection to `/ws` writes one log when it ends, with `route: 'ws'`, the close code, reason and who closed it (`client`, `server` or `network`), its duration, and message and byte counts. The page adds `demoCode` and `demoUser` to the socket URL so the log carries them. A WebSocket upgrade is not an APM transaction, so these logs have no `trace.id`. Levels: INFO for 1000, 1001, 1005 and 3000-4999, WARN for anything else (for example 1006, a dropped connection).

The same line is printed to stdout as JSON for local runs. Responses also carry an `x-trace-id` header (exposed through CORS) so a browser can read the trace ID from the response.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `NEW_RELIC_LICENSE_KEY` | none | Your **ingest license key** (not the browser key). Never commit it. |
| `NEW_RELIC_APP_NAME` | `BrowserLogsDemo API` | APM app name |
| `ALLOWED_ORIGINS` | `https://mcaronnewrelic.github.io,http://localhost:8080,http://127.0.0.1:8080` | Comma-separated origins allowed to call the API |
| `PORT` | `3000` | |
| `SITE_ROOT` | none (set to `/app/site` in the Docker image) | Folder of demo pages to serve. When set, the server also injects the browser agent into each page and requires `NEW_RELIC_LICENSE_KEY`. |

## Run locally

```bash
cd backend
npm install
NEW_RELIC_LICENSE_KEY=your_ingest_key node server.js
```

Then open `https://mcaronnewrelic.github.io/BrowserLogsDemo/tracing.html?backend=http://localhost:3000`. Chrome allows a public page to call `localhost`, but it may first ask for permission to access devices on your local network.

## Deploy to Render (example)

1. In Render, choose **New > Web Service** and connect this repo.
2. Set **Runtime** to Docker and leave **Root Directory** empty (the `Dockerfile` is at the repo root and also serves the pages). For an API-only service, use Node instead, with Root Directory `backend`, build command `npm install` and start command `npm start`.
3. Add the environment variables `NEW_RELIC_LICENSE_KEY` and, optionally, `NEW_RELIC_APP_NAME`.
4. Deploy, then open `https://<your-service>.onrender.com/api/health`. It should return `"apm": true`.

Free instances sleep when idle, so the first request after a while can take 30 seconds or more. Any host that runs a Node.js process or a Docker image works the same way.

## Connect it to the page (required)

1. **Allow the backend origin for tracing.** In New Relic, open **Browser > (your app) > Settings > Application settings**. Keep **Distributed tracing** on, turn on **Cross-origin resource sharing (CORS)**, add `https://<your-service>.onrender.com` to the allowed list, and save.
2. **Re-copy the snippet.** The copy/paste snippet includes the allowed origins list, so it does not pick up the new setting automatically. Copy the updated snippet from **Application settings** and replace the old one in `index.html`, `errors.html` and `tracing.html`. It sits right after the `<meta name="viewport">` tag. In `tracing.html`, keep the small header-capture script that comes before it.
3. **Point the page at the backend.** In `tracing.html`, set `CONFIG.backendUrl` to `https://<your-service>.onrender.com`, or try it first with `?backend=https://<your-service>.onrender.com`.

If the page shows **"Agent added no trace headers"** for backend requests, step 1 or 2 is not done yet. If it shows **"Backend started a new trace"**, the APM agent is not attached or has distributed tracing turned off.

## Test

```bash
npm test
```

This runs `server.test.js`, `websocket.test.js`, `demo-identity.test.js` and `page-logic.test.js`, and needs no install. `page-logic.test.js` loads each demo page's `LOGIC` block straight from the HTML, so it tests the code the pages run. Among other things, it checks that every NRQL query a page offers is a single statement that filters to the learner's session code.

A reverse proxy in front of the server must pass WebSocket upgrades through. Caddy's `reverse_proxy` does this by default. With nginx, add `proxy_http_version 1.1;` and set the `Upgrade` and `Connection` headers for `/ws`.
