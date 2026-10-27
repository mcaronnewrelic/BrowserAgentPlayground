// Run: node --test backend/server.test.js   (no install needed)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server.js');

const ORIGIN = 'https://mcaronnewrelic.github.io';
const TP = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

// Records what the server asks the APM agent to do.
function fakeNewRelic() {
  const calls = { attrs: [], errors: [], logs: [] };
  return {
    calls,
    addCustomAttribute: (k, v) => calls.attrs.push([k, v]),
    noticeError: (e) => calls.errors.push(e.message),
    recordLogEvent: (e) => calls.logs.push(e),
    getTraceMetadata: () => ({ traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: 'aaaaaaaaaaaaaaaa' }),
    getLinkingMetadata: () => ({ 'trace.id': '4bf92f3577b34da6a3ce929d0e0e4736', 'span.id': 'aaaaaaaaaaaaaaaa', 'entity.name': 'BrowserLogsDemo API' })
  };
}

async function withServer(opts, fn) {
  // Tests stay quiet: stdout log lines go to opts.stdout (or nowhere).
  const server = createServer(Object.assign({ allowedOrigins: [ORIGIN], stdout: () => {} }, opts));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); } finally { await new Promise(r => server.close(r)); }
}

test('preflight allows the trace headers for an allowed origin', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(base + '/api/products', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'newrelic,traceparent,tracestate' }
    });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), ORIGIN);
    const allowed = res.headers.get('access-control-allow-headers').toLowerCase();
    ['newrelic', 'traceparent', 'tracestate', 'content-type'].forEach(h => assert.ok(allowed.includes(h), h));
    assert.ok(res.headers.get('access-control-allow-methods').includes('POST'));
  });
});

test('private network preflight is answered for allowed origins', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(base + '/api/products', {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Private-Network': 'true' }
    });
    assert.strictEqual(res.headers.get('access-control-allow-private-network'), 'true');
  });
});

test('unknown origins get no CORS allow header', async () => {
  await withServer({}, async (base) => {
    const res = await fetch(base + '/api/products', { headers: { Origin: 'https://evil.example' } });
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });
});

test('API responses echo received trace headers and APM trace metadata', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    const res = await fetch(base + '/api/products?demoCode=NR-AB12&demoUser=Ada&rid=R1', {
      headers: { Origin: ORIGIN, traceparent: TP, tracestate: '123@nr=0-1', newrelic: 'eyJ2Ijp9' }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data.products) && body.data.products.length > 0);
    assert.strictEqual(body.trace.received.traceparent, TP);
    assert.strictEqual(body.trace.received.tracestate, '123@nr=0-1');
    assert.strictEqual(body.trace.received.newrelic, true);
    assert.deepStrictEqual(body.trace.apm, { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: 'aaaaaaaaaaaaaaaa' });
    assert.deepStrictEqual(nr.calls.attrs, [['demoCode', 'NR-AB12'], ['demoUser', 'Ada']]);
  });
});

test('without an APM agent, apm is null and nothing throws', async () => {
  await withServer({ nr: null }, async (base) => {
    const body = await (await fetch(base + '/api/cart')).json();
    assert.strictEqual(body.trace.apm, null);
    assert.strictEqual(body.trace.received.traceparent, null);
    assert.strictEqual(body.trace.received.newrelic, false);
  });
});

// Pinned outside the fault window (minute 30) so the healthy path is deterministic whatever time CI runs.
const OUT_OF_WINDOW = () => new Date(Date.UTC(2026, 0, 1, 10, 30));
const IN_WINDOW = () => new Date(Date.UTC(2026, 0, 1, 10, 5));

test('checkout calls internal inventory and payment services', async () => {
  const seen = [];
  await withServer({ nr: null, now: OUT_OF_WINDOW, onRequest: (p) => seen.push(p) }, async (base) => {
    const res = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.match(body.data.orderId, /^ORD-/);
    assert.deepStrictEqual(body.data.steps.map(s => s.service), ['inventory', 'payment']);
    assert.ok(seen.includes('/internal/inventory') && seen.includes('/internal/payment'));
  });
});

test('in the fault window, payment fails and checkout fails downstream of it', async () => {
  const nr = fakeNewRelic();
  const waits = [];
  const sleep = (ms) => { waits.push(ms); return Promise.resolve(); };
  await withServer({ nr, now: IN_WINDOW, paymentErrorRate: 1, sleep }, async (base) => {
    const res = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 502);
    assert.match((await res.json()).error, /payment/i);
    assert.ok(waits.includes(700), 'payment was slowed inside the window');
    assert.ok(nr.calls.errors.some(m => /payment gateway timeout/i.test(m)), 'payment error reported to APM');
    assert.ok(nr.calls.errors.some(m => /did not authorize/i.test(m)), 'checkout error reported to APM');
  });
});

test('in the fault window, payment is slow but checkout still succeeds when it does not error', async () => {
  const waits = [];
  const sleep = (ms) => { waits.push(ms); return Promise.resolve(); };
  await withServer({ nr: null, now: IN_WINDOW, paymentErrorRate: 0, sleep }, async (base) => {
    const res = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 200);
    assert.ok(waits.includes(700), 'payment was slowed inside the window');
  });
});

test('outside the fault window, payment is healthy even with the error rate at 1', async () => {
  const waits = [];
  const sleep = (ms) => { waits.push(ms); return Promise.resolve(); };
  await withServer({ nr: null, now: OUT_OF_WINDOW, paymentErrorRate: 1, sleep }, async (base) => {
    const res = await fetch(base + '/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.strictEqual(res.status, 200);
    assert.ok(!waits.includes(700), 'no extra payment latency outside the window');
  });
});

test('profile is healthy outside the bad-deploy window, and throws the new error inside it', async () => {
  const healthy = () => new Date(Date.UTC(2026, 0, 1, 10, 5));   // minute 5: before the :30 window
  const buggy = () => new Date(Date.UTC(2026, 0, 1, 10, 35));    // minute 35: inside the :30-:44 window
  await withServer({ nr: null, now: healthy, badDeployErrorRate: 1 }, async (base) => {
    const res = await fetch(base + '/api/profile');
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).data.tier, 'gold');
  });
  const nr = fakeNewRelic();
  await withServer({ nr, now: buggy, badDeployErrorRate: 1 }, async (base) => {
    const res = await fetch(base + '/api/profile');
    assert.strictEqual(res.status, 500);
    assert.match((await res.json()).error, /reading 'tier'/);
    assert.ok(nr.calls.errors.some(m => /reading 'tier'/.test(m)), 'the new error is reported to APM');
  });
});

test('catalog fans out into one internal call per item (the N+1 pattern), capped', async () => {
  async function detailCount(items) {
    const seen = [];
    let products;
    await withServer({ nr: null, now: OUT_OF_WINDOW, onRequest: (p) => seen.push(p) }, async (base) => {
      const res = await fetch(base + '/api/catalog?items=' + items);
      assert.strictEqual(res.status, 200);
      products = (await res.json()).data.products.length;
    });
    return { details: seen.filter(p => p.startsWith('/internal/product/')).length, products };
  }
  assert.deepStrictEqual(await detailCount(5), { details: 5, products: 5 });
  assert.deepStrictEqual(await detailCount(999), { details: 50, products: 50 });
});

test('slow waits the requested time, capped at 5000 ms', async () => {
  const waits = [];
  const sleep = (ms) => { waits.push(ms); return Promise.resolve(); };
  await withServer({ nr: null, sleep }, async (base) => {
    await fetch(base + '/api/slow?ms=1500');
    await fetch(base + '/api/slow?ms=999999');
    await fetch(base + '/api/slow?ms=abc');
  });
  assert.deepStrictEqual(waits, [1500, 5000, 1000]);
});

test('recommendations does capped CPU work and returns products', async () => {
  await withServer({ nr: null }, async (base) => {
    const res = await fetch(base + '/api/recommendations?iterations=1000');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('x-compute-iterations'), '1000');
    const body = await res.json();
    assert.strictEqual(body.data.recommendations.length, 3);
    assert.ok(body.data.recommendations[0].sku, 'recommendations are products with a sku');

    // Out-of-range and garbage fall back to the cap or the default, never the raw input. The effective
    // work rides on the response header, so the body stays a plain product list.
    const capped = await fetch(base + '/api/recommendations?iterations=999999999');
    assert.strictEqual(capped.headers.get('x-compute-iterations'), '50000000');
    const def = await fetch(base + '/api/recommendations?iterations=abc');
    assert.strictEqual(def.headers.get('x-compute-iterations'), '2000000');
  });
});

test('fail returns 500 and reports the error to APM', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    const res = await fetch(base + '/api/fail?demoCode=NR-AB12');
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.ok(body.error);
    assert.ok(body.trace, 'trace info still returned on errors');
    assert.strictEqual(nr.calls.errors.length, 1);
    // Same message for everyone so the errors group; the code reaches the error as a transaction attribute.
    assert.strictEqual(nr.calls.errors[0], 'Payment service unavailable');
    assert.deepStrictEqual(nr.calls.attrs.find(([k]) => k === 'demoCode'), ['demoCode', 'NR-AB12']);
  });
});

test('unknown API routes return a JSON 404 with trace info', async () => {
  await withServer({ nr: null }, async (base) => {
    const res = await fetch(base + '/api/missing');
    assert.strictEqual(res.status, 404);
    assert.ok((await res.json()).trace);
  });
});

test('each API request records a log event in the transaction (trace context added by the agent)', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    await fetch(base + '/api/products?demoCode=NR-AB12&demoUser=Ada', { headers: { traceparent: TP } });
  });
  assert.strictEqual(nr.calls.logs.length, 1);
  const log = nr.calls.logs[0];
  assert.strictEqual(log.level, 'INFO');
  assert.strictEqual(log.message, 'GET /api/products 200'); // the code is an attribute, not in the message
  assert.strictEqual(log.route, 'api/products');
  assert.strictEqual(log.httpStatus, 200);
  assert.strictEqual(log.demoCode, 'NR-AB12');
  assert.strictEqual(log.demoUser, 'Ada');
  assert.strictEqual(log.receivedTraceparent, true);
});

test('checkout logs once per service, all in the same trace', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    await fetch(base + '/api/checkout?demoCode=NR-AB12', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  });
  assert.deepStrictEqual(nr.calls.logs.map(l => l.route), ['internal/inventory', 'internal/payment', 'api/checkout']);
  assert.ok(nr.calls.logs.every(l => l.demoCode === 'NR-AB12'), 'internal calls carry the demo code too');
});

test('failures log at ERROR with the error, not-found at WARN', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    await fetch(base + '/api/fail?demoCode=NR-AB12');
    await fetch(base + '/api/missing');
  });
  const [fail, missing] = nr.calls.logs;
  assert.strictEqual(fail.level, 'ERROR');
  assert.ok(fail.error instanceof Error && fail.error.message.includes('Payment service unavailable'));
  assert.strictEqual(fail.httpStatus, 500);
  assert.strictEqual(missing.level, 'WARN');
  assert.strictEqual(missing.httpStatus, 404);
});

test('health checks and preflights are not logged', async () => {
  const nr = fakeNewRelic();
  await withServer({ nr }, async (base) => {
    await fetch(base + '/api/health');
    await fetch(base + '/api/products', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } });
  });
  assert.strictEqual(nr.calls.logs.length, 0);
});

test('responses carry x-trace-id, exposed to the allowed origin', async () => {
  await withServer({ nr: fakeNewRelic() }, async (base) => {
    const res = await fetch(base + '/api/products', { headers: { Origin: ORIGIN } });
    assert.strictEqual(res.headers.get('x-trace-id'), '4bf92f3577b34da6a3ce929d0e0e4736');
    assert.ok(res.headers.get('access-control-expose-headers').toLowerCase().includes('x-trace-id'));
  });
  await withServer({ nr: null }, async (base) => {
    const res = await fetch(base + '/api/products');
    assert.strictEqual(res.headers.get('x-trace-id'), null, 'no APM, no trace id header');
  });
});

test('a JSON log line with trace.id goes to stdout for local runs', async () => {
  const lines = [];
  await withServer({ nr: fakeNewRelic(), stdout: (l) => lines.push(l) }, async (base) => {
    await fetch(base + '/api/cart?demoCode=NR-AB12');
  });
  assert.strictEqual(lines.length, 1);
  const line = JSON.parse(lines[0]);
  assert.strictEqual(line['trace.id'], '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.strictEqual(line['span.id'], 'aaaaaaaaaaaaaaaa');
  assert.strictEqual(line.level, 'INFO');
  assert.match(line.message, /GET \/api\/cart 200/);
});

test('without APM, logging still prints to stdout and nothing throws', async () => {
  const lines = [];
  await withServer({ nr: null, stdout: (l) => lines.push(l) }, async (base) => {
    await fetch(base + '/api/cart');
  });
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(JSON.parse(lines[0])['trace.id'], null);
});

test('health reports whether APM is attached', async () => {
  await withServer({ nr: fakeNewRelic() }, async (base) => {
    assert.deepStrictEqual((await (await fetch(base + '/api/health')).json()).data, { ok: true, apm: true, websocket: true });
  });
});

// ---- serving the demo pages ----

const PAGE = '<head>\n<script src="nr-init.js"></script>\n<!-- NR:SNIPPET -->\n<script src="nr-config.js"></script>\n<script src="nr-agent.js"></script>\n<!-- /NR:SNIPPET -->\n</head><body>hi</body>';
const AGENT_HEADER = "<script type='text/javascript'>window.NREUM||(NREUM={});NREUM.info = {\"applicationID\":\"42\"}; $& loader</script>";

async function withSite(opts, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.writeFileSync(path.join(root, 'index.html'), PAGE);
  fs.writeFileSync(path.join(root, 'tracing.html'), PAGE);
  fs.writeFileSync(path.join(root, 'nr-config.js'), '// account');
  fs.writeFileSync(path.join(root, '.secret.html'), 'nope');
  fs.mkdirSync(path.join(root, 'backend'));
  fs.writeFileSync(path.join(root, 'backend', 'server.js'), 'nope');
  try { await withServer(Object.assign({ siteRoot: root }, opts), fn); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('pages: the static snippet is replaced by the APM agent header, with named transaction', async () => {
  const named = [];
  const nr = Object.assign(fakeNewRelic(), {
    setTransactionName: (n) => named.push(n),
    getBrowserTimingHeader: () => AGENT_HEADER
  });
  await withSite({ nr }, async (base) => {
    const res = await fetch(base + '/tracing.html');
    const html = await res.text();
    assert.strictEqual(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.strictEqual(res.headers.get('cache-control'), 'no-store');
    assert.ok(html.includes(AGENT_HEADER), 'header inserted verbatim ($ patterns untouched)');
    assert.ok(!html.includes('nr-config.js') && !html.includes('nr-agent.js'));
    assert.ok(html.includes('nr-init.js'), 'demo settings stay');
    assert.ok(html.includes('<meta name="demo-backend" content="same-origin">'));
    assert.deepStrictEqual(named, ['pages/tracing.html']);
  });
});

test('pages: "/" serves index.html while /api/health still answers', async () => {
  await withSite({ nr: Object.assign(fakeNewRelic(), { getBrowserTimingHeader: () => AGENT_HEADER }) }, async (base) => {
    assert.ok((await (await fetch(base + '/')).text()).includes('<body>hi</body>'));
    assert.strictEqual((await (await fetch(base + '/api/health')).json()).data.ok, true);
  });
});

test('pages: with no usable agent header the account snippet is dropped, never shipped', async () => {
  const nr = Object.assign(fakeNewRelic(), { getBrowserTimingHeader: () => '<!-- NREUM: (4) -->' });
  for (const opts of [{ nr }, { nr: null }]) {
    await withSite(opts, async (base) => {
      const html = await (await fetch(base + '/index.html')).text();
      assert.ok(!html.includes('nr-config.js') && !html.includes('nr-agent.js'));
      assert.ok(html.includes('<body>hi</body>'));
    });
  }
});

test('pages: assets are served, and hidden or backend files are not', async () => {
  await withSite({ nr: null }, async (base) => {
    const js = await fetch(base + '/nr-config.js');
    assert.strictEqual(js.status, 200);
    assert.strictEqual(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
    for (const p of ['/.secret.html', '/backend/server.js', '/%2e%2e/etc/passwd', '/..%2fserver.js', '/missing.html', '/%E0%A4%A']) {
      assert.strictEqual((await fetch(base + p)).status, 404, p);
    }
  });
});

test('pages: without siteRoot the server stays API-only', async () => {
  await withServer({ nr: null }, async (base) => {
    assert.strictEqual((await (await fetch(base + '/')).json()).data.ok, true);
    assert.strictEqual((await fetch(base + '/index.html')).status, 404);
  });
});
