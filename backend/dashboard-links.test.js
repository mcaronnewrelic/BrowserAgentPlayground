'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'site.js'), 'utf8');
const DASHBOARDS = {
  mySession: 'NjkzMjM0N3xWSVp8REFTSEJPQVJEfGRhOjEzNDEzNTU3',
  investigationsEvidence: 'NjkzMjM0N3xWSVp8REFTSEJPQVJEfGRhOjEzNDEzNTU1'
};
const LINK = 'https://one.newrelic.com/dashboards/detail/' + DASHBOARDS.mySession + '?state=test';

function element(dataset = {}) {
  return {
    dataset, attributes: {}, listeners: {}, textContent: '',
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    hasAttribute(k) { return k in this.attributes; },
    addEventListener(k, fn) { this.listeners[k] = fn; },
    insertAdjacentElement(position, el) { this.status = el; }
  };
}

function load({ search = '', servedByBackend = false, fetch, blocked = false } = {}) {
  const links = Object.keys(DASHBOARDS).map((key) => element({ dashboard: key }));
  const requests = [], opens = [];
  const identity = { name: 'Test', code: 'NR-FIRST' };
  const tab = { location: { href: '' }, focus() {}, closed: false };
  const window = {
    matchMedia: () => ({ matches: false }),
    DemoIdentity: { current: () => identity, save() {} },
    open(url, target) { opens.push({ url, target }); return blocked ? null : tab; }
  };
  vm.runInNewContext(SOURCE, {
    window, URL, URLSearchParams, AbortSignal,
    location: { origin: 'https://local.example', search, pathname: '/events.html' },
    document: {
      querySelector: () => servedByBackend ? {} : null,
      querySelectorAll: (s) => s === '[data-dashboard]' ? links : [],
      getElementById: () => null,
      createElement: () => element(),
      addEventListener() {}
    },
    setTimeout() {},
    fetch: async (url, opts) => {
      requests.push({ url, body: JSON.parse(opts.body), method: opts.method, headers: { ...opts.headers } });
      return fetch ? fetch(url, opts) : { ok: true, json: async () => ({ data: { url: LINK } }) };
    }
  });
  window.Demo.start({ state: {} });
  return { demo: window.Demo, links, requests, identity, opens, tab };
}

function click(link, type = 'click', button = 0) {
  return link.listeners[type]({ type, button, preventDefault() {} });
}

test('all dashboard links call the API with the right GUID, variables and time window', async () => {
  const { links, requests, tab, opens } = load();
  for (const link of links) await click(link);
  assert.equal(requests.length, 2);
  for (const [i, key] of Object.keys(DASHBOARDS).entries()) {
    assert.deepEqual(requests[i], {
      url: 'https://browser.nru.to/api/dashboard-deeplink',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        account: 6932347, guid: DASHBOARDS[key],
        variables: i === 0 ? { demoCode: 'NR-FIRST' } : {},
        duration: i === 0 ? 3600000 : 10800000
      }
    });
    assert.equal(links[i].status.textContent, '');
    assert.equal(links[i].hasAttribute('aria-busy'), false);
  }
  assert.deepEqual(opens, [{ url: '', target: 'newrelic' }, { url: '', target: 'newrelic' }]);
  assert.equal(tab.location.href, LINK);
});

test('dashboard links read the current identity on every click, including middle-click', async () => {
  const { links, identity, requests } = load();
  await click(links[0]);
  identity.code = 'NR-CHANGED';
  await click(links[0], 'auxclick', 1);
  assert.equal(requests[1].body.variables.demoCode, 'NR-CHANGED');
  await click(links[0], 'auxclick', 2);
  assert.equal(requests.length, 2);
});

test('backend-served pages use the same origin; a backend override takes precedence', async () => {
  for (const [options, expected] of [
    [{ servedByBackend: true }, 'https://local.example'],
    [{ search: '?backend=http://localhost:3000/' }, 'http://localhost:3000'],
    [{ servedByBackend: true, search: '?backend=https://api.example/' }, 'https://api.example']
  ]) {
    const app = load(options);
    await click(app.links[0]);
    assert.equal(app.requests[0].url, expected + '/api/dashboard-deeplink');
  }
});

test('API and network failures are visible and never navigate to an unfiltered dashboard', async () => {
  for (const [fetch, message] of [
    [async () => ({ ok: false, status: 500, json: async () => ({ error: 'NEW_RELIC_API_KEY environment variable not set' }) }), /NEW_RELIC_API_KEY/],
    [async () => ({ ok: false, status: 503, json: async () => ({}) }), /HTTP 503/],
    [async () => { throw new Error('Network unavailable'); }, /Network unavailable/],
    [async () => ({ ok: true, json: async () => ({ data: {} }) }), /no link/],
    [async () => ({ ok: true, json: async () => ({ data: { url: 'https://unexpected.example/' } }) }), /unexpected destination/]
  ]) {
    const app = load({ fetch });
    await click(app.links[0]);
    assert.match(app.links[0].status.textContent, message);
    assert.equal(app.links[0].hasAttribute('aria-busy'), false);
    assert.equal(app.tab.location.href, '');
  }
});

test('popup blocking, disabled backend and invalid backend are reported without making API calls', async () => {
  for (const [options, message] of [
    [{ blocked: true }, /Allow popups/],
    [{ search: '?backend=none' }, /need a backend/],
    [{ search: '?backend=javascript:alert(1)' }, /HTTP or HTTPS/]
  ]) {
    const app = load(options);
    await click(app.links[0]);
    assert.match(app.links[0].status.textContent, message);
    assert.equal(app.requests.length, 0);
  }
});

test('a pending request reserves the tab synchronously and ignores repeated clicks, then permits retry', async () => {
  let resolve;
  const app = load({ fetch: () => new Promise((done) => { resolve = done; }) });
  const first = click(app.links[0]);
  assert.equal(app.opens.length, 1);
  assert.equal(app.links[0].attributes['aria-busy'], 'true');
  await click(app.links[0]);
  assert.equal(app.requests.length, 1);
  resolve({ ok: false, status: 500, json: async () => ({ error: 'Try again' }) });
  await first;
  assert.match(app.links[0].status.textContent, /Try again/);
  const retry = click(app.links[0]);
  resolve({ ok: true, json: async () => ({ data: { url: LINK } }) });
  await retry;
  assert.equal(app.tab.location.href, LINK);
  assert.equal(app.links[0].status.textContent, '');
});
