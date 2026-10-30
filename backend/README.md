# Tracing demo backend

A tiny Node.js API for `tracing.html`. With the New Relic APM agent attached, browser requests from the demo page continue into this service, so a single trace shows the click, the network request, the API transaction, and its internal calls to `inventory` and `payment`.

There are no dependencies apart from the `newrelic` agent, which loads only when `NEW_RELIC_LICENSE_KEY` is set. Without a key the server still runs, so you can test CORS and the page wiring first.

## Endpoints

| Route | What it does |
| --- | --- |
| `GET /api/health` | Reachability check used by the page's mode badge |
| `GET /api/products`, `GET /api/cart` | Simple JSON responses |
| `POST /api/checkout` | Calls `/internal/inventory` and `/internal/payment` over HTTP, which produces child spans. In the fault window (below) payment is slow and sometimes fails, and checkout returns 502 downstream of it. |
| `GET /api/catalog?items=8` | Fetches each item's details in its own `/internal/product/:sku` call, so one request fans out into many identical child spans (the N+1 pattern). `items` is capped at 50. |
| `GET /api/orders/:id` | Order lookup |
| `GET /api/slow?ms=1500` | Waits before responding (capped at 5000 ms) |
| `GET /api/recommendations?iterations=2000000` | Returns a few recommended products after a fixed amount of real CPU work, so its response time rises under CPU contention (iterations capped at 50,000,000; the effective count is on the `x-compute-iterations` response header). Used by the noisy-neighbor exercise. |
| `GET /api/fail` | Returns 500 and reports the error with `noticeError` |
| `POST /api/dashboard-deeplink` | Generates New Relic dashboard deeplinks with template variables pre-set. See Dashboard Deeplink API below. |
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
| `NEW_RELIC_APP_NAME` | `Browser Agent Playground API` | APM app name. browser.nru.to sets `Browser Agent Playground`. |
| `ALLOWED_ORIGINS` | `https://mcaronnewrelic.github.io,http://localhost:8080,http://127.0.0.1:8080` | Comma-separated origins allowed to call the API |
| `PORT` | `3000` | |
| `SITE_ROOT` | none (set to `/app/site` in the Docker image) | Folder of demo pages to serve. When set, the server also injects the browser agent into each page and requires `NEW_RELIC_LICENSE_KEY`. |
| `FAULT_WINDOW_MINUTES` | `15` | The downstream-culprit exercise: for this many minutes at the top of each hour (UTC), payment is slow and sometimes fails. 15 of every 60 means it's always in a default 1-hour query range. `0` turns it off. |
| `PAYMENT_SLOW_MS` | `700` | Extra latency on payment during the fault window. |
| `PAYMENT_ERROR_RATE` | `0.25` | Fraction of payments that fail (503) during the fault window. |

The downstream-culprit and N+1 endpoints are the engines behind the guided exercises in [`../exercises/`](../exercises/) and the pages that go with them. The fault is driven by the server's own clock, so no cron or extra process is needed.

## Run locally

```bash
cd backend
npm install
NEW_RELIC_LICENSE_KEY=your_ingest_key node server.js
```

Then open `https://mcaronnewrelic.github.io/BrowserAgentPlayground/tracing.html?backend=http://localhost:3000`. Chrome allows a public page to call `localhost`, but it may first ask for permission to access devices on your local network.

## Deploy to Render (example)

1. In Render, choose **New > Web Service** and connect this repo.
2. Set **Runtime** to Docker and leave **Root Directory** empty (the `Dockerfile` is at the repo root and also serves the pages). For an API-only service, use Node instead, with Root Directory `backend`, build command `npm install` and start command `npm start`.
3. Add the environment variables `NEW_RELIC_LICENSE_KEY` and, optionally, `NEW_RELIC_APP_NAME`.
4. Deploy, then open `https://<your-service>.onrender.com/api/health`. It should return `"apm": true`.

Free instances sleep when idle, so the first request after a while can take 30 seconds or more. Any host that runs a Node.js process or a Docker image works the same way.

## Connect it to the page

When the backend serves the pages itself (the Docker image, as on browser.nru.to), `tracing.html` calls its own origin and there is nothing to set up.

When the pages come from somewhere else, such as GitHub Pages or a local static server, `tracing.html` calls the backend in its `CONFIG.backendUrl`, which is `https://browser.nru.to`. That cross-origin call needs three things to line up:

1. **The page points at the backend.** `CONFIG.backendUrl` in `tracing.html`. To try another backend without editing, add `?backend=https://your-backend` to the page's address; `?backend=none` forces browser-only mode.
2. **The browser agent may add trace headers for it.** The agent adds `traceparent`, `tracestate` and `newrelic` only to same-origin requests and to origins in `distributed_tracing.allowed_origins`. `tracing.html` sets that list itself, near the top, so add any new backend there. (The **Cross-origin resource sharing (CORS)** list in the browser app's **Application settings** does the same job for the copy/paste snippet, but this page doesn't rely on it.)
3. **The backend accepts the page's origin.** Its `ALLOWED_ORIGINS` must include the page's origin: scheme, host and port, without any path. The default list already includes `https://mcaronnewrelic.github.io`, which covers any repository published there. To test from a local static server, add its origin too, for example `ALLOWED_ORIGINS=https://mcaronnewrelic.github.io,http://localhost:8080`. Setting `ALLOWED_ORIGINS` replaces the default list, so include the GitHub Pages origin as well.

If the page shows **"Agent added no trace headers"** for backend requests, step 2 is missing. If requests fail with a CORS error in the browser console, step 3 is. If it shows **"Backend started a new trace"**, the APM agent is not attached or has distributed tracing turned off.

## Test

```bash
npm test
```

This runs `server.test.js`, `websocket.test.js`, `demo-identity.test.js`, `page-logic.test.js` and `dashboard-links.test.js`, and needs no install. `page-logic.test.js` loads each demo page's `LOGIC` block straight from the HTML, so it tests the code the pages run. Among other things, it checks that every NRQL query a page offers is a single statement that filters to the learner's session code. `dashboard-links.test.js` checks dashboard API requests, session-code changes, backend selection, tab handling and visible failures with mocked API responses.

A reverse proxy in front of the server must pass WebSocket upgrades through. Caddy's `reverse_proxy` does this by default. With nginx, add `proxy_http_version 1.1;` and set the `Upgrade` and `Connection` headers for `/ws`.

## Dashboard Deeplink API

This backend provides a `/api/dashboard-deeplink` endpoint for generating New Relic dashboard deeplinks with template variables pre-set. This is useful for sharing dashboards with specific configurations without requiring users to manually set variables.

The root demo pages use this API through `site.js` for both **See all your data** and **Open the evidence board**. My Session receives the current `demoCode` variable and a one-hour time window; the evidence board has no template variables and uses a three-hour window. Links are generated on each click so a changed session code is used immediately. Query and entity links are unchanged.

When the backend serves the page, requests use the same origin. Static pages (including GitHub Pages and a local static server) use `https://browser.nru.to`. Override that with `?backend=http://localhost:3000` for local development; `?backend=none` disables dashboard requests. Configure `NEW_RELIC_API_KEY` on whichever backend receives the requests and allow the page's origin in `ALLOWED_ORIGINS`. The API key stays server-side. Link failures are shown beside the button; there is no fallback to an unfiltered dashboard.

For Docker Compose, set `NEW_RELIC_API_KEY` in the repository-root `.env` file (alongside `NEW_RELIC_LICENSE_KEY`) or export it in your shell. Compose passes it into the app container; a file at `backend/.env` is not read by Compose. After pulling changes, rebuild and recreate the app from the repository root:

```bash
docker compose up -d --build app
docker compose logs --tail=50 app
curl --fail http://localhost:3000/api/health
```

### Quick Start

```bash
# 1. Add your New Relic user API key to the existing backend/.env file
# NEW_RELIC_API_KEY=NRAK-<your-api-key>

# 2. Start the backend
node --env-file=.env server.js

# 3. Generate a deeplink
curl -X POST http://localhost:3000/api/dashboard-deeplink \
  -H 'Content-Type: application/json' \
  -d '{
    "account": 7673270,
    "guid": "NzY3MzI3MHxWSVp8REFTSEJPQVJEfGRhOjI3NDA2NjM",
    "variables": {"Environment": "production"}
  }'
```

### API Details

**Endpoint:** `POST /api/dashboard-deeplink`

**Required Parameters:**
- `account` (number): Your New Relic account ID
- `guid` (string): Dashboard entity GUID from the dashboard URL: `/dashboards/detail/<GUID>`

**Optional Parameters:**
- `env` (string): New Relic region, `"us"` or `"eu"` (default: `"us"`)
- `duration` (number): Time window in milliseconds (default: `1800000` = 30 minutes)
  - Common values: `1800000` (30 min), `3600000` (1 hr), `86400000` (24 hrs)
- `variables` (object): Template variables to pre-set, e.g., `{"Environment": "production", "Customer": "Acme Inc"}`
- `filter` (string): Entity filter bar value, e.g., `"tags.env = production"`

**Response:**
```json
{
  "data": {
    "url": "https://one.newrelic.com/dashboards/detail/<GUID>?state=..."
  },
  "trace": { ... }
}
```

**Error Response:**
```json
{
  "error": "account is required",
  "trace": { ... }
}
```

### APM Behavior

This endpoint is **automatically ignored** by the New Relic APM agent and will **not** appear as a transaction in APM dashboards. This is configured via `rules.ignore` in `newrelic.js` and keeps your APM view focused on actual application traffic.

### Usage Examples

**JavaScript (Frontend)**
```javascript
async function openDashboard() {
  const response = await fetch('/api/dashboard-deeplink', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      account: 7673270,
      guid: 'NzY3MzI3MHx...',
      variables: {Environment: 'production', Customer: 'Acme Inc'}
    })
  });
  const {data, error} = await response.json();
  if (error) {
    console.error('Error:', error);
  } else {
    window.open(data.url, '_blank');
  }
}
```

**Python**
```python
import requests

response = requests.post(
  'http://localhost:3000/api/dashboard-deeplink',
  json={
    'account': 7673270,
    'guid': 'NzY3MzI3MHx...',
    'variables': {'Environment': 'production'}
  }
)

data = response.json()
if 'error' in data:
  print(f"Error: {data['error']}")
else:
  print(f"Dashboard link: {data['data']['url']}")
```

**Node.js Backend**
```javascript
const {createDashboardDeeplink} = require('./dashboard-deeplink.js');

const url = await createDashboardDeeplink({
  apiKey: process.env.NEW_RELIC_API_KEY,
  account: 7673270,
  guid: 'NzY3MzI3MHx...',
  variables: {Environment: 'production'}
});

console.log('Dashboard URL:', url);
```

### Finding Your Dashboard Information

**Account ID:**
1. Go to New Relic → Settings → Account settings
2. Or look in the URL: `https://one.newrelic.com/accounts/<ACCOUNT_ID>/...`

**Dashboard GUID:**
1. Open the dashboard in New Relic
2. Look at the URL: `https://one.newrelic.com/dashboards/detail/<GUID>`
3. Copy the GUID value

**Variable Names:**
1. Open your dashboard
2. Click **Edit** → **Variables**
3. Note the **Name** field (not the display title) for each variable
4. Variable names are **case-sensitive**

### Configuration

The endpoint requires `NEW_RELIC_API_KEY` from your environment:

```bash
# Create .env file (git-ignored)
NEW_RELIC_API_KEY=NRAK-<your-new-relic-user-api-key>
```

Get your API key from https://one.newrelic.com/user-menu:
1. Click your profile
2. Select **API Keys**
3. Create or copy a **User API Key** (starts with `NRAK-`)

### Troubleshooting

| Problem | Solution |
| --- | --- |
| "NEW_RELIC_API_KEY environment variable not set" | Set `NEW_RELIC_API_KEY=NRAK-...` in the environment, or load `.env` with `node --env-file=.env server.js` |
| 401 Unauthorized | API key is invalid or expired; get a new one from New Relic |
| Variables not appearing | Check variable names are exact and case-sensitive |
| Link opens but filters don't apply | Verify NRQL filter syntax is correct |
| Dashboard not found (404) | Verify the GUID is correct |

### Interactive Demo

An interactive demo interface is available at `dashboard-deeplink-demo.html` in the root directory when the backend is running on `http://localhost:8080/dashboard-deeplink-demo.html`.

### Implementation Details

The Node.js implementation converts the original Python utility (`DeepLinkDashboard/nr-dashboard-deeplink.py`) into a backend API. It:

1. Validates all input parameters
2. Constructs the dashboard state JSON payload
3. Makes an HTTPS PUT request to the New Relic Hurl service
4. Parses the response with the state UUID
5. Returns the full dashboard deeplink URL

The module has zero external dependencies and uses only built-in Node.js modules.
