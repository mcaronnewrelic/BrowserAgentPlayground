// Run: node --test backend/page-logic.test.js   (no install needed)
// Each demo page keeps its pure functions between /*LOGIC-START*/ and /*LOGIC-END*/. These tests load
// that block from the page itself, so they test exactly the code the page runs.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SITE = path.join(__dirname, '..');
const CODE = 'NR-TEST1';

// Stands in for demo-identity.js, which vitals.html's logic uses to clean the code from the URL.
const DemoIdentity = { sanitizeCode: (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16) };

function loadLogic(page) {
  const html = fs.readFileSync(path.join(SITE, page), 'utf8');
  const m = /\/\*LOGIC-START\*\/([\s\S]*?)\/\*LOGIC-END\*\//.exec(html);
  if (!m) return null;
  const window = { DemoIdentity, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  vm.runInContext(m[1], vm.createContext({ window, URL, URLSearchParams }));
  const names = Object.keys(window).filter((k) => k !== 'DemoIdentity' && k !== 'atob');
  assert.strictEqual(names.length, 1, page + ' should export exactly one object');
  return window[names[0]];
}

// Objects made inside the vm context have that context's prototypes, which deepStrictEqual rejects.
// A JSON round trip turns results into plain objects from this context.
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function wrap(api) {
  return Object.fromEntries(Object.entries(api).map(([k, v]) => [k, typeof v === 'function' ? (...a) => plain(v(...a)) : plain(v)]));
}

const PAGES = fs.readdirSync(SITE).filter((f) => f.endsWith('.html')).sort();
const RAW = Object.fromEntries(PAGES.map((p) => [p, loadLogic(p)]).filter(([, v]) => v));
const L = Object.fromEntries(Object.entries(RAW).map(([p, api]) => [p, wrap(api)]));

// ---- Every script on every page at least parses ----

test('every inline script on every page, and site.js, is valid JavaScript', () => {
  let checked = 0;
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(SITE, page), 'utf8');
    for (const [i, m] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
      assert.doesNotThrow(() => new vm.Script(m[1], { filename: page + ' inline script ' + (i + 1) }), page + ' inline script ' + (i + 1));
      checked++;
    }
  }
  for (const file of ['site.js', 'demo-identity.js', 'nr-init.js', 'nr-config.js']) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(SITE, file), 'utf8'), { filename: file }), file);
  }
  assert.ok(checked >= 50, 'found ' + checked + ' inline scripts');
});

// ---- Every query a page offers is one runnable NRQL statement ----

test('every demo page has a logic block', () => {
  for (const page of PAGES.filter((p) => p !== 'index.html')) assert.ok(L[page], page);
});

test('every NRQL builder returns a single query, filtered to your code when it takes one', () => {
  const TRACE_IDS = ['4bf92f3577b34da6a3ce929d0e0e4736'];
  let checked = 0;
  for (const [page, api] of Object.entries(RAW)) {
    for (const [name, fn] of Object.entries(api)) {
      if (!/^build\w*Nrql$/.test(name) || typeof fn !== 'function') continue;
      const params = /^function\s*\w*\(([^)]*)\)/.exec(fn.toString())[1].split(',').map((s) => s.trim()).filter(Boolean);
      const args = params.map((p) => (p === 'code' ? CODE : p === 'traceIds' ? TRACE_IDS : p === 'field' ? 'rageClick' : undefined));
      const q = fn(...args);
      const where = page + ' ' + name;
      assert.strictEqual(typeof q, 'string', where);
      assert.match(q, /\bFROM\b/, where + ' has FROM');
      assert.match(q, /\bSINCE\b/, where + ' has SINCE');
      assert.ok(!/\n\s*\n/.test(q.trim()), where + ' is one statement (no blank line between two queries)');
      assert.strictEqual((q.match(/\bSELECT\b/g) || []).length, 1, where + ' has exactly one SELECT');
      // The site's convention (README): your own data over the last hour, no ORDER BY (raw rows come back newest first).
      assert.ok(!/\bORDER BY\b/.test(q), where + ' has no ORDER BY');
      if (params.includes('code')) {
        assert.ok(q.includes("'" + CODE + "'"), where + ' filters by your code');
        assert.match(q, /SINCE 1 hour ago/, where + ' looks back one hour');
      }
      if (params.includes('traceIds')) assert.ok(q.includes(TRACE_IDS[0]), where + ' filters by your trace IDs');
      checked++;
    }
  }
  assert.ok(checked >= 25, 'found ' + checked + ' builders');
});

// ---- Logs ----

test('logs: verbosity keeps a level and everything more severe', () => {
  const { isCollected } = L['logs.html'];
  assert.strictEqual(isCollected('error', 'WARN'), true);
  assert.strictEqual(isCollected('warn', 'warn'), true);
  assert.strictEqual(isCollected('info', 'WARN'), false);
  assert.strictEqual(isCollected('trace', 'TRACE'), true);
  assert.strictEqual(isCollected('nonsense', 'WARN'), false);
});

test('logs: the query and the Logs UI search find your logs by demoCode, not the message', () => {
  const { buildNrql, buildLogsSearch } = L['logs.html'];
  assert.match(buildNrql(CODE), new RegExp("WHERE demoCode = '" + CODE + "'\\n"));
  assert.doesNotMatch(buildNrql(CODE), /message LIKE/);
  assert.strictEqual(buildLogsSearch(CODE), 'demoCode:"' + CODE + '"');
});

// ---- Errors ----

test('errors: ignore wins over group, matching is case-insensitive', () => {
  const { decideError } = L['errors.html'];
  const rules = { ignoreEnabled: true, ignoreText: 'resizeobserver', groupEnabled: true, groupText: 'loop', groupLabel: 'Layout' };
  assert.deepStrictEqual(decideError('ResizeObserver loop limit exceeded', rules), { action: 'ignore' });
  assert.deepStrictEqual(decideError('Render loop', rules), { action: 'group', group: 'Layout' });
  assert.deepStrictEqual(decideError('Payment failed', rules), { action: 'report' });
});

test('errors: an empty group label never groups (New Relic would drop the error)', () => {
  const { decideError } = L['errors.html'];
  assert.deepStrictEqual(decideError('Payment failed', { groupEnabled: true, groupText: 'payment', groupLabel: '  ' }), { action: 'report' });
  assert.deepStrictEqual(decideError('anything', { ignoreEnabled: true, ignoreText: '' }), { action: 'report' }, 'empty ignore text matches nothing');
});

test('errors: decisions become what setErrorHandler expects, and methods map to event types', () => {
  const { handlerResult, eventTypes } = L['errors.html'];
  assert.strictEqual(handlerResult({ action: 'ignore' }), true);
  assert.deepStrictEqual(handlerResult({ action: 'group', group: 'Payments' }), { group: 'Payments' });
  assert.strictEqual(handlerResult({ action: 'report' }), false);
  assert.deepStrictEqual(eventTypes('console.error'), ['Log']);
  assert.deepStrictEqual(eventTypes('both'), ['JavaScriptError', 'Log']);
  assert.deepStrictEqual(eventTypes('noticeError'), ['JavaScriptError']);
});

// ---- Tracing ----

test('tracing: traceparent parsing follows W3C and rejects all-zero IDs', () => {
  const { parseTraceparent } = L['tracing.html'];
  const p = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.deepStrictEqual({ ...p }, { version: '00', traceId: '4bf92f3577b34da6a3ce929d0e0e4736', parentId: '00f067aa0ba902b7', flags: '01', sampled: true });
  assert.strictEqual(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00').sampled, false);
  assert.strictEqual(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), null);
  assert.strictEqual(parseTraceparent('not a header'), null);
});

test('tracing: endpoints are static files without a backend, API routes with one', () => {
  const { resolveEndpoint, normalizeBackendUrl, withParams } = L['tracing.html'];
  assert.deepStrictEqual({ ...resolveEndpoint('products', '') }, { url: 'data/products.json', method: 'GET', target: 'static' });
  assert.deepStrictEqual({ ...resolveEndpoint('checkout', 'http://localhost:3000/') }, { url: 'http://localhost:3000/api/checkout', method: 'POST', target: 'backend' });
  assert.strictEqual(resolveEndpoint('slow', ''), null, 'slow needs the backend');
  assert.strictEqual(normalizeBackendUrl('javascript:alert(1)'), '');
  assert.strictEqual(withParams('/api/slow?ms=1500', { demoCode: CODE }), '/api/slow?ms=1500&demoCode=' + CODE);
});

test('tracing: the inspector status explains what happened to each request', () => {
  const { traceStatus } = L['tracing.html'];
  const sent = { traceId: 'a'.repeat(32) };
  assert.strictEqual(traceStatus({ target: 'static', sent }), 'browser-only');
  assert.strictEqual(traceStatus({ target: 'static', sent: null }), 'not-traced');
  assert.strictEqual(traceStatus({ target: 'backend', sent: null }), 'needs-cors');
  assert.strictEqual(traceStatus({ target: 'backend', sent, backend: null }), 'no-backend-data');
  assert.strictEqual(traceStatus({ target: 'backend', sent, backend: { received: {} } }), 'not-received');
  assert.strictEqual(traceStatus({ target: 'backend', sent, backend: { received: { traceparent: 'x' }, apm: null } }), 'no-apm');
  assert.strictEqual(traceStatus({ target: 'backend', sent, backend: { received: { traceparent: 'x' }, apm: { traceId: sent.traceId } } }), 'joined');
  assert.strictEqual(traceStatus({ target: 'backend', sent, backend: { received: { traceparent: 'x' }, apm: { traceId: 'b'.repeat(32) } } }), 'mismatch');
});

test('tracing: trace queries use only valid, unique, newest IDs, and none without IDs', () => {
  const { buildSpanNrql } = L['tracing.html'];
  assert.strictEqual(buildSpanNrql([]), null);
  const q = buildSpanNrql(['a'.repeat(32), 'bad', 'A'.repeat(32), 'b'.repeat(32)]);
  assert.match(q, new RegExp("IN \\('" + 'b'.repeat(32) + "', '" + 'a'.repeat(32) + "'\\)"));
});

test('tracing: browser logs carry the trace ID the request was sent with', () => {
  const { traceIdForLog, logLevelFor, buildLogAttributes } = L['tracing.html'];
  const id = 'c'.repeat(32);
  assert.deepStrictEqual({ ...traceIdForLog({ sent: { traceId: id }, responseHeader: id }) }, { traceId: id, source: 'request-header', responseTraceId: id, match: true });
  assert.strictEqual(traceIdForLog({ sent: null, responseHeader: id }).source, 'response-header');
  assert.strictEqual(traceIdForLog({ sent: null }).source, 'none');
  assert.deepStrictEqual([logLevelFor(200), logLevelFor(404), logLevelFor(500), logLevelFor(200, true)], ['info', 'warn', 'error', 'error']);
  const attrs = buildLogAttributes({ trace: { source: 'none', traceId: null, match: null }, url: '/api/cart?demoCode=X', status: 200, method: 'GET', via: 'fetch' });
  assert.ok(!('trace.id' in attrs), 'no trace.id key rather than a null one');
  assert.strictEqual(attrs.requestUrl, '/api/cart');
});

// ---- Vitals ----

test('vitals: ratings use Google\'s thresholds, inclusive of the good bound', () => {
  const { rate } = L['vitals.html'];
  assert.deepStrictEqual([rate('lcp', 2500), rate('lcp', 2501), rate('lcp', 4001)], ['good', 'needs-improvement', 'poor']);
  assert.deepStrictEqual([rate('cls', 0.1), rate('cls', 0.25), rate('cls', 0.26)], ['good', 'needs-improvement', 'poor']);
  assert.strictEqual(rate('inp', undefined), null);
});

test('vitals: CLS is the worst session window, ignoring shifts right after input', () => {
  const { computeCLS } = L['vitals.html'];
  assert.strictEqual(computeCLS([{ startTime: 0, value: 0.1 }, { startTime: 500, value: 0.05 }, { startTime: 3000, value: 0.02 }]), 0.15);
  assert.strictEqual(computeCLS([{ startTime: 0, value: 0.1 }, { startTime: 2000, value: 0.12 }]), 0.12, 'shifts over 1 s apart start a new window');
  assert.strictEqual(computeCLS([{ startTime: 0, value: 0.3, hadRecentInput: true }]), 0);
});

test('vitals: INP is the worst interaction, skipping one outlier per 50', () => {
  const { computeINP } = L['vitals.html'];
  assert.strictEqual(computeINP([]), undefined);
  assert.strictEqual(computeINP([{ interactionId: 1, duration: 40 }, { interactionId: 1, duration: 90 }, { interactionId: 2, duration: 60 }]), 90);
  const fifty = Array.from({ length: 50 }, (_, i) => ({ interactionId: i + 1, duration: i + 1 }));
  assert.strictEqual(computeINP(fifty), 49);
});

test('vitals: modes default to poor, and the code from the URL is cleaned', () => {
  const { parseModes, buildModeQuery } = L['vitals.html'];
  assert.deepStrictEqual({ ...parseModes('?lcp=good&code=nr-ab12<script>') }, { lcp: 'good', cls: 'poor', code: 'NR-AB12SCRIPT' });
  assert.deepStrictEqual({ ...parseModes('') }, { lcp: 'poor', cls: 'poor', code: null });
  assert.strictEqual(buildModeQuery({ lcp: 'good', cls: 'poor', code: CODE }), '?lcp=good&cls=poor&code=' + CODE);
});

// ---- Frustration, Measures, WebSockets, Install ----

test('frustration: the rage window counts only recent clicks', () => {
  const { rageWindowCount } = L['frustration.html'];
  assert.strictEqual(rageWindowCount([0, 400, 900, 1200], 1300, 1000), 3);
});

test('measures: the demo prefix marks this page\'s own timings, and queries find them', () => {
  const { isOurs, buildAllNrql } = L['measures.html'];
  assert.strictEqual(isOurs('demo:search'), true);
  assert.strictEqual(isOurs('next-hydration'), false);
  assert.match(buildAllNrql(CODE), /entryDetail\.demoCode = 'NR-TEST1'/, 'finds marks made before demoCode was set');
});

test('websockets: only ws and wss servers are accepted from the address', () => {
  const { normalizeServer, backendServer, withIdentity, DEFAULT_SERVER } = L['websockets.html'];
  assert.strictEqual(normalizeServer('wss://example.com/socket'), 'wss://example.com/socket');
  assert.strictEqual(normalizeServer('https://example.com'), DEFAULT_SERVER);
  assert.strictEqual(normalizeServer('javascript:alert(1)'), DEFAULT_SERVER);
  assert.strictEqual(backendServer({ protocol: 'https:', host: 'browser.nru.to' }), 'wss://browser.nru.to/ws');
  assert.strictEqual(backendServer({ protocol: 'http:', host: 'localhost:3000' }), 'ws://localhost:3000/ws');
  assert.strictEqual(withIdentity('wss://h/ws', CODE, 'Ada L'), 'wss://h/ws?demoCode=' + CODE + '&demoUser=Ada%20L');
});

test('websockets: ?ws= wins, then the page\'s own backend, then browser.nru.to if it answers /ws, then the echo server', () => {
  const { pickServer, DEFAULT_SERVER } = L['websockets.html'];
  const here = { protocol: 'https:', host: 'mcaronnewrelic.github.io' };
  assert.deepStrictEqual(pickServer({ wsParam: 'wss://mine.example/ws', servedByBackend: true, location: here, remoteWebSocket: true }),
    { server: 'wss://mine.example/ws', onBackend: false, source: 'param' });
  assert.deepStrictEqual(pickServer({ wsParam: null, servedByBackend: true, location: { protocol: 'http:', host: 'localhost:3000' }, remoteWebSocket: true }),
    { server: 'ws://localhost:3000/ws', onBackend: true, source: 'same-origin' });
  assert.deepStrictEqual(pickServer({ wsParam: null, servedByBackend: false, location: here, remoteWebSocket: true }),
    { server: 'wss://browser.nru.to/ws', onBackend: true, source: 'remote' });
  assert.deepStrictEqual(pickServer({ wsParam: null, servedByBackend: false, location: here, remoteWebSocket: false }),
    { server: DEFAULT_SERVER, onBackend: false, source: 'echo' });
});

test('install: request paths drop the browser key, and the install method is detected', () => {
  const { beaconPath, installMethod } = L['install.html'];
  assert.strictEqual(beaconPath('https://bam.nr-data.net/events/1/NRJS-780dc46aaae18844d3c?a=1'), '/events/1');
  const doc = (meta, agent) => ({ querySelector: (s) => (s.includes('demo-backend') ? meta : s.includes('nr-agent') ? agent : null) });
  assert.strictEqual(installMethod(doc({}, null)), 'apm');
  assert.strictEqual(installMethod(doc(null, {})), 'copy');
  assert.strictEqual(installMethod(doc(null, null)), 'unknown');
});
