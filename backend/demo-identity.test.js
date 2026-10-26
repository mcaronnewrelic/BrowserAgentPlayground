// Run: node --test backend/demo-identity.test.js   (no install needed)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'demo-identity.js'), 'utf8');

// Loads demo-identity.js the way a page does, with a fake tab. Returns what it did.
function loadOnPage(page, { store = {}, storageBlocked = false, search = '' } = {}) {
  const redirects = [];
  const sessionStorage = storageBlocked
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} }
    : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const announced = [];
  const window = { crypto: require('node:crypto').webcrypto, dispatchEvent: (e) => announced.push(e) };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const context = vm.createContext({
    window, CustomEvent, sessionStorage, JSON, URLSearchParams, Uint32Array,
    location: { pathname: '/BrowserAgentPlayground/' + page, search, replace: (url) => redirects.push(url) }
  });
  vm.runInContext(SOURCE, context);
  return { identity: window.DemoIdentity, redirects, store, announced };
}

test('a page without a stored name is sent home, keeping where it was going', () => {
  const { redirects } = loadOnPage('tracing.html', { search: '?backend=http://x' });
  assert.deepStrictEqual(redirects, ['index.html?next=tracing.html%3Fbackend%3Dhttp%3A%2F%2Fx']);
});

test('a name with no code yet still counts as incomplete', () => {
  const { redirects } = loadOnPage('logs.html', { store: { nrDemoIdentity: JSON.stringify({ name: 'Ada' }) } });
  assert.strictEqual(redirects.length, 1);
});

test('a page with a stored name and code stays put', () => {
  const store = { nrDemoIdentity: JSON.stringify({ name: 'Ada', code: 'NR-ABCD' }) };
  const { redirects, identity } = loadOnPage('logs.html', { store });
  assert.deepStrictEqual(redirects, []);
  assert.deepStrictEqual({ ...identity.current() }, { name: 'Ada', code: 'NR-ABCD' });
});

test('the home page and the site root never redirect', () => {
  assert.deepStrictEqual(loadOnPage('index.html').redirects, []);
  assert.deepStrictEqual(loadOnPage('').redirects, []);
});

test('with storage blocked the pages do not redirect in a loop', () => {
  assert.deepStrictEqual(loadOnPage('logs.html', { storageBlocked: true }).redirects, []);
});

test('current() makes a code once and keeps it', () => {
  const { identity, store } = loadOnPage('index.html');
  const first = identity.current();
  assert.match(first.code, /^NR-[A-HJ-NP-Z2-9]{4}$/);
  assert.strictEqual(identity.current().code, first.code);
  assert.strictEqual(JSON.parse(store.nrDemoIdentity).code, first.code);
});

test('a blank name or code never erases what is stored', () => {
  const { identity } = loadOnPage('index.html');
  identity.save({ name: '  Ada  ', code: 'nr-abcd' });
  const kept = identity.save({ name: '   ', code: '' });
  assert.deepStrictEqual({ ...kept }, { name: 'Ada', code: 'NR-ABCD' });
});

test('names are trimmed to 40 characters and codes are cleaned', () => {
  const { identity } = loadOnPage('index.html');
  const saved = identity.save({ name: 'x'.repeat(60), code: "nr-1'; DROP--" });
  assert.strictEqual(saved.name.length, 40);
  assert.strictEqual(saved.code, 'NR-1DROP--');
});

test('?next= only accepts plain demo pages', () => {
  const { identity } = loadOnPage('index.html');
  assert.strictEqual(identity.safeNext('tracing.html?backend=http%3A%2F%2Fx'), 'tracing.html?backend=http%3A%2F%2Fx');
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '../x.html', 'a.html#x', '', null]) {
    assert.strictEqual(identity.safeNext(bad), 'install.html', String(bad));
  }
});

test('saving tells the page strip what changed', () => {
  const { identity, announced } = loadOnPage('index.html');
  identity.save({ name: 'Ada', code: 'nr-abcd' });
  const last = announced[announced.length - 1];
  assert.strictEqual(last.type, 'demo-identity-change');
  assert.deepStrictEqual({ ...last.detail }, { name: 'Ada', code: 'NR-ABCD' });
});

test('with storage blocked, one identity is still kept for the page', () => {
  const { identity } = loadOnPage('logs.html', { storageBlocked: true });
  const first = identity.current();
  assert.strictEqual(identity.current().code, first.code);
  identity.save({ name: 'Ada' });
  assert.deepStrictEqual({ ...identity.read() }, { name: 'Ada', code: first.code });
});
