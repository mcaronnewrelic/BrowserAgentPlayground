// Name and session code shared by every demo page. They live in sessionStorage, so each tab
// starts fresh. Every page except the home page sends visitors there until both are set.
(function () {
  'use strict';
  var KEY = 'nrDemoIdentity';
  var HOME = 'index.html';
  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function randomIndex(n) {
    var c = window.crypto || window.msCrypto;
    if (c) { var a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
    return Math.floor(Math.random() * n);
  }
  function makeCode() {
    var s = 'NR-';
    for (var i = 0; i < 4; i++) s += ALPHABET[randomIndex(ALPHABET.length)];
    return s;
  }
  function sanitizeCode(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16); }
  function cleanName(name) { return String(name || '').trim().slice(0, 40); }

  // Private browsing modes and blocked storage throw; the demo then runs without the redirect.
  function storageWorks() {
    try { sessionStorage.setItem(KEY + '.probe', '1'); sessionStorage.removeItem(KEY + '.probe'); return true; } catch (e) { return false; }
  }

  // Kept as well, so a browser that blocks sessionStorage still sees one consistent identity per page.
  var memory = { name: '', code: '' };

  function read() {
    try {
      var stored = JSON.parse(sessionStorage.getItem(KEY)) || {};
      return { name: cleanName(stored.name), code: sanitizeCode(stored.code) };
    } catch (e) { return { name: memory.name, code: memory.code }; }
  }

  // Lets the "Your data is tagged as" strip follow along with whichever page code changed it.
  function announce(identity) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('demo-identity-change', { detail: identity }));
    }
  }

  // A blank name or code never overwrites a stored one, so clearing a field cannot lock you out.
  function save(change) {
    var identity = read();
    var name = cleanName(change && change.name);
    var code = sanitizeCode(change && change.code);
    if (name) identity.name = name;
    if (code) identity.code = code;
    try { sessionStorage.setItem(KEY, JSON.stringify(identity)); } catch (e) { /* nothing to keep it in */ }
    memory = { name: identity.name, code: identity.code };
    announce(identity);
    return identity;
  }

  // The stored identity, with a fresh code made (and kept) if there is none yet.
  function current() {
    var identity = read();
    return identity.code ? identity : save({ name: identity.name, code: makeCode() });
  }

  function isComplete(identity) { return Boolean(identity.name && identity.code); }

  // Only plain demo page names are accepted, so ?next= cannot send anyone to another site.
  function safeNext(next) { return /^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/i.test(next || '') ? next : 'logs.html'; }

  function redirectHomeIfIncomplete() {
    var page = location.pathname.split('/').pop();
    if (!page || page === HOME || !storageWorks() || isComplete(read())) return;
    location.replace(HOME + '?next=' + encodeURIComponent(page + location.search));
  }

  // The strip stays folded while the identity is set. It opens itself when the name or code is missing,
  // for example when the browser blocks sessionStorage.
  function initWhoStrip() {
    var strip = document.getElementById('who');
    if (!strip) return;
    function show(identity) {
      Array.prototype.forEach.call(document.querySelectorAll('.who-name'), function (el) { el.textContent = identity.name || 'no name yet'; });
      Array.prototype.forEach.call(document.querySelectorAll('.who-code'), function (el) { el.textContent = identity.code; });
    }
    var identity = current();
    show(identity);
    strip.open = !isComplete(identity);
    window.addEventListener('demo-identity-change', function (e) { show(e.detail); });
  }

  window.DemoIdentity = {
    makeCode: makeCode, sanitizeCode: sanitizeCode, read: read, save: save, current: current,
    isComplete: isComplete, safeNext: safeNext, storageWorks: storageWorks
  };
  redirectHomeIfIncomplete();
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', initWhoStrip);
})();
