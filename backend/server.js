'use strict';
// Demo backend for tracing.html, plus the /ws echo endpoint for websockets.html.
// Zero dependencies apart from the New Relic agent,
// which loads only when NEW_RELIC_LICENSE_KEY is set. It must be required before
// anything else so it can instrument the http module.
const nr = process.env.NEW_RELIC_LICENSE_KEY ? require('newrelic') : null;

const http = require('node:http');
const { createPages } = require('./pages.js');
const { attachWebSocket } = require('./websocket.js');

const DEFAULT_ORIGINS = ['https://mcaronnewrelic.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const ALLOW_HEADERS = 'newrelic, traceparent, tracestate, content-type';
const MAX_SLOW_MS = 5000;
// /api/recommendations computes "personalized" picks with a fixed amount of real CPU work (not a sleep),
// so its response time climbs when the host's CPU is contended, e.g. by the noisy-neighbor exercise.
// Fixed work, so wall-clock grows as the app's share of the CPU shrinks. Tunable per request with
// ?iterations=, capped so it can't be abused.
const RECOMMEND_ITERATIONS = 2000000;
const MAX_RECOMMEND_ITERATIONS = 50000000;
// /api/catalog fetches this many item details, one internal call each (the N+1 pattern). Capped.
const CATALOG_ITEMS = 8;
const MAX_CATALOG_ITEMS = 50;

const PRODUCTS = [
  { sku: 'NR-TEE', name: 'Observability tee', price: 24 },
  { sku: 'NR-MUG', name: 'Golden signals mug', price: 16 },
  { sku: 'NR-HOOD', name: 'Full-stack hoodie', price: 58 },
  { sku: 'NR-STICK', name: 'Sticker pack', price: 6 }
];

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

function createServer(opts) {
  opts = opts || {};
  const agent = 'nr' in opts ? opts.nr : nr;
  const allowedOrigins = opts.allowedOrigins || DEFAULT_ORIGINS;
  const sleep = opts.sleep || defaultSleep;
  const onRequest = opts.onRequest || function () {};
  const stdout = opts.stdout || ((line) => process.stdout.write(line + '\n'));
  // Clock and RNG are injectable so tests can land inside or outside the fault window deterministically.
  const now = opts.now || (() => new Date());
  const random = opts.random || Math.random;

  // Downstream-culprit exercise: for the first FAULT_WINDOW_MINUTES of each hour (UTC), the payment
  // dependency gets slow and errors part of the time, so checkout slows and fails. A 15-minute window
  // means any default 60-minute query range always contains it. See backend/README.md and exercises/.
  const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const faultWindowMinutes = opts.faultWindowMinutes != null ? opts.faultWindowMinutes : num(process.env.FAULT_WINDOW_MINUTES, 15);
  const paymentSlowMs = opts.paymentSlowMs != null ? opts.paymentSlowMs : num(process.env.PAYMENT_SLOW_MS, 700);
  const paymentErrorRate = opts.paymentErrorRate != null ? opts.paymentErrorRate : num(process.env.PAYMENT_ERROR_RATE, 0.25);
  // Bad-deploy exercise: a second window, offset from the payment one so the two exercises don't collide.
  // /api/profile throws a new error during it, lined up with a deployment marker the host cron emits.
  const badDeployStart = opts.badDeployStart != null ? opts.badDeployStart : num(process.env.BAD_DEPLOY_WINDOW_START, 30);
  const badDeployMinutes = opts.badDeployMinutes != null ? opts.badDeployMinutes : num(process.env.BAD_DEPLOY_WINDOW_MINUTES, 15);
  const badDeployErrorRate = opts.badDeployErrorRate != null ? opts.badDeployErrorRate : num(process.env.BAD_DEPLOY_ERROR_RATE, 0.5);
  function inWindow(start, len) { const m = now().getUTCMinutes(); return m >= start && m < start + len; }
  function inFaultWindow() { return inWindow(0, faultWindowMinutes); }

  function apm(method) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (agent && typeof agent[method] === 'function') {
      try { return agent[method].apply(agent, args); } catch (e) { /* never break the demo */ }
    }
    return undefined;
  }

  const pages = opts.siteRoot ? createPages({ root: opts.siteRoot, getBrowserHeader: () => apm('getBrowserTimingHeader') }) : null;

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      res.setHeader('Access-Control-Expose-Headers', 'x-trace-id');
      // Lets a public page (GitHub Pages) call this server when it runs on localhost.
      if (req.headers['access-control-request-private-network'] === 'true') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
      }
    }
  }

  function traceInfo(req) {
    const meta = agent ? apm('getTraceMetadata') : null;
    return {
      received: {
        traceparent: req.headers.traceparent || null,
        tracestate: req.headers.tracestate || null,
        newrelic: Boolean(req.headers.newrelic)
      },
      apm: meta && meta.traceId ? { traceId: meta.traceId, spanId: meta.spanId } : null
    };
  }

  // One log line per request, written while the transaction is active so the APM
  // agent's recordLogEvent adds trace.id, span.id and entity.* (logs in context).
  function logRequest(req, path, status, ctx) {
    if (!ctx || !ctx.route || ctx.route === 'api/health') return;
    const level = status >= 500 ? 'ERROR' : (status >= 400 ? 'WARN' : 'INFO');
    const message = req.method + ' ' + path + ' ' + status;
    const event = { message, level, route: ctx.route, httpStatus: status, method: req.method, receivedTraceparent: Boolean(req.headers.traceparent) };
    if (ctx.demoCode) event.demoCode = ctx.demoCode;
    if (ctx.demoUser) event.demoUser = ctx.demoUser;
    if (ctx.error) event.error = ctx.error;
    apm('recordLogEvent', Object.assign({}, event)); // the agent mutates what it is given
    const link = apm('getLinkingMetadata') || {};
    const line = Object.assign({ timestamp: new Date().toISOString(), 'trace.id': link['trace.id'] || null, 'span.id': link['span.id'] || null }, event);
    if (line.error) line.error = line.error.message;
    try { stdout(JSON.stringify(line)); } catch (e) { /* never break the demo */ }
  }

  // One log line per WebSocket connection, when it ends. Upgrades run outside any APM
  // transaction, so these logs carry entity.* but no trace.id.
  const NORMAL_CLOSES = [1000, 1001, 1005];
  function logSocket(s) {
    const demoCode = (s.query.get('demoCode') || '').slice(0, 32);
    const demoUser = (s.query.get('demoUser') || '').slice(0, 64);
    const normal = NORMAL_CLOSES.includes(s.closeCode) || (s.closeCode >= 3000 && s.closeCode <= 4999);
    const message = 'WebSocket ' + s.path + ' closed ' + s.closeCode +
      (s.closeReason ? ' "' + s.closeReason + '"' : '') + ' by ' + s.closedBy + ' after ' + s.durationMs + ' ms';
    const event = {
      message, level: normal ? 'INFO' : 'WARN', route: 'ws',
      closeCode: s.closeCode, closeReason: s.closeReason, closedBy: s.closedBy, durationMs: s.durationMs,
      messagesIn: s.messagesIn, bytesIn: s.bytesIn, messagesOut: s.messagesOut, bytesOut: s.bytesOut
    };
    if (demoCode) event.demoCode = demoCode;
    if (demoUser) event.demoUser = demoUser;
    apm('recordLogEvent', Object.assign({}, event));
    try { stdout(JSON.stringify(Object.assign({ timestamp: new Date().toISOString() }, event))); } catch (e) { /* never break the demo */ }
  }

  function send(req, res, status, payload, ctx, extraHeaders) {
    const trace = traceInfo(req);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (trace.apm) headers['x-trace-id'] = trace.apm.traceId;
    if (extraHeaders) Object.assign(headers, extraHeaders);
    logRequest(req, ctx && ctx.path, status, ctx);
    res.writeHead(status, headers);
    res.end(JSON.stringify(Object.assign({}, payload, { trace })));
  }

  // Calls another endpoint on this same server over HTTP. The APM agent sees an
  // outbound request plus a new inbound transaction, which shows up as child spans.
  function callInternal(server, path) {
    return new Promise((resolve, reject) => {
      const port = server.address().port;
      const r = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } }, (resp) => {
        let data = '';
        resp.on('data', (c) => { data += c; });
        // Carry the child's status back so a caller (checkout) can react to a downstream failure.
        resp.on('end', () => { try { const parsed = JSON.parse(data); parsed.status = resp.statusCode; resolve(parsed); } catch (e) { reject(e); } });
      });
      r.on('error', reject);
      r.end('{}');
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    onRequest(path);
    cors(req, res);

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const demoCode = url.searchParams.get('demoCode');
    const demoUser = url.searchParams.get('demoUser');
    if (demoCode) apm('addCustomAttribute', 'demoCode', demoCode.slice(0, 32));
    if (demoUser) apm('addCustomAttribute', 'demoUser', demoUser.slice(0, 64));

    const ctx = { path, demoCode: demoCode && demoCode.slice(0, 32), demoUser: demoUser && demoUser.slice(0, 64), route: null };
    const route = (name) => { ctx.route = name; apm('setTransactionName', name); };
    const withCode = (p) => p + (ctx.demoCode ? '?demoCode=' + encodeURIComponent(ctx.demoCode) : '');

    try {
      if (pages && await pages.handle(req, res, path, route)) return;
      if (path === '/' || path === '/api/health') {
        route('api/health');
        // websocket: this build answers /ws (websockets.html checks it before connecting from another site).
        return send(req, res, 200, { data: { ok: true, apm: Boolean(agent), websocket: true } }, ctx);
      }
      if (path === '/api/products' && req.method === 'GET') {
        route('api/products');
        return send(req, res, 200, { data: { products: PRODUCTS } }, ctx);
      }
      if (path === '/api/cart' && req.method === 'GET') {
        route('api/cart');
        return send(req, res, 200, { data: { items: [{ sku: 'NR-TEE', qty: 2 }, { sku: 'NR-MUG', qty: 1 }], total: 64 } }, ctx);
      }
      if (path === '/api/checkout' && req.method === 'POST') {
        route('api/checkout');
        const inventory = await callInternal(server, withCode('/internal/inventory'));
        const payment = await callInternal(server, withCode('/internal/payment'));
        // The user-facing failure, caused downstream: when payment fails, checkout fails too. The trace
        // shows the error originating in the payment span, not in checkout's own code.
        if (payment.status >= 500) {
          const err = new Error('Checkout failed: payment did not authorize');
          apm('noticeError', err);
          ctx.error = err;
          return send(req, res, 502, { error: err.message }, ctx);
        }
        return send(req, res, 200, { data: { orderId: rid('ORD'), steps: [inventory.data, payment.data] } }, ctx);
      }
      // N+1 exercise: instead of one call for the catalog, this fetches each item's details in its own
      // call, so the trace shows one request fanning out into many identical child spans. items= sets how
      // many (capped), cycling through the catalog.
      if (path === '/api/catalog' && req.method === 'GET') {
        route('api/catalog');
        const n = Math.min(num(url.searchParams.get('items'), CATALOG_ITEMS), MAX_CATALOG_ITEMS);
        const products = [];
        for (let i = 0; i < n; i++) {
          const sku = PRODUCTS[i % PRODUCTS.length].sku;
          const detail = await callInternal(server, withCode('/internal/product/' + sku));
          products.push(detail.data);
        }
        return send(req, res, 200, { data: { products } }, ctx);
      }
      if (path.startsWith('/api/orders/') && req.method === 'GET') {
        route('api/orders/:id');
        return send(req, res, 200, { data: { orderId: path.split('/').pop(), status: 'confirmed' } }, ctx);
      }
      if (path === '/api/profile' && req.method === 'GET') {
        route('api/profile');
        // In the bad-deploy window this "new version" has a bug: a null-reference that only some requests
        // hit. It lines up with the deployment marker the host cron emits, so the error spike follows a
        // deploy. Outside the window the endpoint is healthy.
        if (inWindow(badDeployStart, badDeployMinutes) && random() < badDeployErrorRate) {
          const err = new TypeError("Cannot read properties of undefined (reading 'tier')");
          apm('noticeError', err);
          ctx.error = err;
          return send(req, res, 500, { error: err.message }, ctx);
        }
        return send(req, res, 200, { data: { user: 'demo', tier: 'gold', memberSince: 2021 } }, ctx);
      }
      if (path === '/api/recommendations' && req.method === 'GET') {
        route('api/recommendations');
        const asked = parseInt(url.searchParams.get('iterations'), 10);
        const iterations = Math.min(Number.isFinite(asked) && asked > 0 ? asked : RECOMMEND_ITERATIONS, MAX_RECOMMEND_ITERATIONS);
        // Real CPU work, not a sleep: this is what makes the endpoint feel CPU contention. The result
        // orders the picks, so the loop can't be optimised away. The effective cost rides on a response
        // header (not the body), so the payload stays a plain list of products.
        let acc = 0;
        for (let i = 0; i < iterations; i++) acc += Math.sqrt(i) * Math.sin(i);
        const offset = Math.abs(Math.round(acc)) % PRODUCTS.length;
        const recommendations = [0, 1, 2].map((n) => PRODUCTS[(offset + n) % PRODUCTS.length]);
        return send(req, res, 200, { data: { recommendations } }, ctx, { 'x-compute-iterations': String(iterations) });
      }
      if (path === '/api/slow') {
        route('api/slow');
        const asked = parseInt(url.searchParams.get('ms'), 10);
        const ms = Math.min(Number.isFinite(asked) && asked > 0 ? asked : 1000, MAX_SLOW_MS);
        await sleep(ms);
        return send(req, res, 200, { data: { waitedMs: ms } }, ctx);
      }
      if (path === '/api/fail') {
        route('api/fail');
        const err = new Error('Payment service unavailable');
        apm('noticeError', err);
        ctx.error = err;
        return send(req, res, 500, { error: err.message }, ctx);
      }
      if (path === '/internal/inventory') {
        route('internal/inventory');
        await sleep(40);
        return send(req, res, 200, { data: { service: 'inventory', reserved: true } }, ctx);
      }
      if (path === '/internal/payment') {
        route('internal/payment');
        await sleep(120);
        // During the fault window the payment gateway is slow, and fails some of the time. This is the
        // real cause behind the slow, sometimes-failing checkout above.
        if (inFaultWindow()) {
          await sleep(paymentSlowMs);
          if (random() < paymentErrorRate) {
            const err = new Error('Payment gateway timeout');
            apm('noticeError', err);
            ctx.error = err;
            return send(req, res, 503, { error: err.message }, ctx);
          }
        }
        return send(req, res, 200, { data: { service: 'payment', authorized: true } }, ctx);
      }
      if (path.startsWith('/internal/product/')) {
        route('internal/product/:sku');
        await sleep(15);
        const sku = decodeURIComponent(path.split('/').pop());
        const product = PRODUCTS.filter((p) => p.sku === sku)[0] || { sku: sku, name: 'Unknown', price: 0 };
        return send(req, res, 200, { data: product }, ctx);
      }
      route('not-found');
      return send(req, res, 404, { error: 'Not found: ' + path }, ctx);
    } catch (err) {
      apm('noticeError', err);
      ctx.route = ctx.route || 'unhandled';
      ctx.error = err;
      return send(req, res, 500, { error: 'Unexpected server error' }, ctx);
    }
  });
  attachWebSocket(server, { onClose: logSocket });
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  if (process.env.SITE_ROOT && !nr) {
    // The pages carry no account of their own, so without a key there is nothing to report to.
    console.error('NEW_RELIC_LICENSE_KEY is required when SITE_ROOT is set.');
    process.exit(1);
  }
  const origins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
  const port = Number(process.env.PORT) || 3000;
  createServer({ allowedOrigins: origins, siteRoot: process.env.SITE_ROOT }).listen(port, () => {
    console.log('Tracing demo backend on port ' + port + (nr ? ' with New Relic APM' : ' (no NEW_RELIC_LICENSE_KEY, APM off)'));
    console.log('Allowed origins: ' + origins.join(', '));
    if (process.env.SITE_ROOT) console.log('Serving the demo pages from ' + process.env.SITE_ROOT);
  });
}
