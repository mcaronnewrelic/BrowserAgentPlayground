// Shared by every page: the site header and page switcher, the "Your data is tagged as" panel, and the
// helpers every demo uses (agent badge, name and session code, copy buttons, toast, activity feed).
// Load it in <head> after demo-identity.js. Demo.header(), Demo.whoSummary() and Demo.identityForm()
// write their markup in place of the <script> tag that calls them, while the page is still loading, so
// nothing shifts once it has rendered.
(function () {
  'use strict';

  // ---- "Open in New Relic" links --------------------------------------------------------------------------
  // Every NRQL block on the site (a <pre id="nrql…"> with a "Copy NRQL" button) gets a one-click link that
  // opens the query in New Relic, pre-filled and already filtered to the visitor's demoCode. The link is
  // built from the <pre>'s own text at click time, so it can never disagree with the query shown above it,
  // and demoCode / the time window are always current. The printed NRQL and its Copy button stay regardless:
  // the link is an accelerator, never the only path.
  //
  // The config lives here, not in nr-config.js: on browser.nru.to the server replaces the whole NR:SNIPPET
  // block (nr-config.js among it) with the APM-injected browser agent, so anything in nr-config.js is gone in
  // production. site.js loads outside that block on every page, so this is always present.
  //
  // L1 pattern (the form that tested working, 2026-10-28): the legacy Insights query URL redirects into
  // one.newrelic.com with the query and account pre-filled. If New Relic retires it, this one function is the
  // only thing to change.
  var NR_DEMO_LINKS = {
    accountId: 6932347,     // "Enablement", the account the demo app reports to.
    host: 'one.newrelic.com',
    // Entity GUIDs, verified against the live account 2026-10-28 (each base64-decodes to
    // 6932347|<domain>|<type>|<id>, which cross-checks the account and entity). GUIDs are identifiers, not
    // secrets, but they must come from the real entities. The browser app and APM service share a name.
    entities: {
      browserApp: 'NjkzMjM0N3xCUk9XU0VSfEFQUExJQ0FUSU9OfDExMzQ3Mzk2OTQ', // "Browser Agent Playground" (BROWSER)
      apmService: 'NjkzMjM0N3xBUE18QVBQTElDQVRJT058MTExNzgyNTc1Ng',      // "Browser Agent Playground" (APM)
      host: 'NjkzMjM0N3xJTkZSQXxOQXwtNDI2NjI5NDI1MDYyMjM5NzkwMQ',        // host "browser.nru.to"
      container: 'NjkzMjM0N3xJTkZSQXxOQXwxNjAxMTcwNTc0MTE0MzE5MTYz'      // "browser-agent-playground-app-1"
    }
  };
  function nrQueryLink(nrql) {
    return 'https://insights.newrelic.com/accounts/' + NR_DEMO_LINKS.accountId +
      '/query?query=' + encodeURIComponent(nrql);
  }
  // The Investigations fault on a fixed minute-of-the-hour schedule (UTC). A query block can carry
  // data-burst="startMin,lenMin"; its link then frames the most recent burst with an absolute SINCE…UNTIL
  // computed at click time, while the printed NRQL keeps its readable relative SINCE. Epoch milliseconds are
  // what NRQL expects (verified 2026-10-28; seconds work too). If the hour's window hasn't started yet, the
  // previous hour's is used, so the link always frames a real, most-recent burst.
  function burstWindow(startMin, lenMin) {
    var now = new Date();
    var start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), startMin);
    var end = start + lenMin * 60000;
    if (now.getTime() < start) { start -= 3600000; end -= 3600000; }
    return { start: start, end: end };
  }
  // L2 — the canonical permalink New Relic returns for an entity. It embeds the account (so it can't land in
  // the wrong one) and survives UI redesigns better than any hand-built launcher URL. No time window is added:
  // whether entity pages honour ?begin/&end is unverified, so the link reliably lands on the right entity and
  // the label says which (the query's own SINCE and the surrounding steps carry the time context).
  var ENTITY_LABELS = {
    browserApp: 'Open the browser app ↗', apmService: 'Open the demo service ↗',
    host: 'Open the host ↗', container: 'Open the container ↗'
  };
  function entityLink(kind) {
    var guid = NR_DEMO_LINKS.entities[kind];
    return guid ? 'https://' + NR_DEMO_LINKS.host + '/redirect/entity/' + guid : null;
  }
  // Points any element carrying data-entity="browserApp|apmService|host|container" at that entity, and labels
  // it for the entity unless it opts out with data-keep-label.
  function setupNrEntity() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-entity]'), function (el) {
      var kind = el.dataset.entity, href = entityLink(kind);
      if (!href) return;
      el.href = href;
      if (ENTITY_LABELS[kind] && !el.hasAttribute('data-keep-label')) el.textContent = ENTITY_LABELS[kind];
    });
  }
  // Adds an "Open in New Relic" link after each "Copy NRQL" button, plus a one-time note about the account.
  function setupNrOpen() {
    var noteAdded = false;
    Array.prototype.forEach.call(document.querySelectorAll('.js-copy'), function (btn) {
      var id = btn.dataset.copyTarget, next = btn.nextElementSibling;
      // Only NRQL blocks (the nrql* ids); skip non-NRQL copy targets and anything already wired.
      if (!id || !/nrql/i.test(id) || (next && next.classList.contains('nr-open'))) return;
      var link = document.createElement('a');
      link.className = 'btn small nr-open';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open in New Relic ↗';
      function refresh() {
        var target = document.getElementById(id), q = target ? target.textContent.trim() : '';
        var burst = target && target.getAttribute('data-burst');
        if (q && burst) {
          var p = burst.split(','), w = burstWindow(+p[0], +p[1]);
          // Swap the printed relative window ("SINCE 1 hour ago") for the absolute burst window in the link only.
          q = q.replace(/SINCE\s+\d+\s+(?:second|minute|hour|day|week)s?\s+ago/i,
            'SINCE ' + w.start + ' UNTIL ' + w.end);
          link.title = 'Opens framed to the most recent fault window (UTC)';
        }
        link.href = q ? nrQueryLink(q)
          : 'https://insights.newrelic.com/accounts/' + NR_DEMO_LINKS.accountId + '/query';
      }
      // Build the href from the current query text at the moment of the click (mouse, touch or keyboard).
      ['mousedown', 'touchstart', 'focus'].forEach(function (ev) { link.addEventListener(ev, refresh); });
      link.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') refresh(); });
      refresh();
      btn.parentNode.insertBefore(link, btn.nextSibling);
      if (!noteAdded) {
        var note = document.createElement('span');
        note.className = 'nr-open-note';
        note.textContent = 'Opens in the shared demo account (Enablement) — sign in there first. If you land in your own account the query still runs, but finds no demoCode data.';
        link.parentNode.insertBefore(note, link.nextSibling);
        noteAdded = true;
      }
    });
  }

  // The learning path, in order. It drives the page switcher in every header and each page's "Up next" link,
  // and matches the stages on the home page. Add a page here and it shows up everywhere.
  var PAGES = [
    { file: 'index.html', label: 'Home' },
    { file: 'install.html', label: 'Install', stage: 'Start here', hook: 'How the agent gets on the page' },
    { file: 'vitals.html', label: 'Vitals', stage: 'What you get for free', hook: 'Core Web Vitals, good or bad, on purpose' },
    { file: 'errors.html', label: 'Errors', stage: 'What you get for free', hook: 'Errors become triaged, grouped data' },
    { file: 'frustration.html', label: 'Frustration', stage: 'What you get for free', hook: 'The frustration signals most teams never see' },
    { file: 'logs.html', label: 'Logs', stage: 'What you add', hook: 'Console calls become New Relic logs' },
    { file: 'events.html', label: 'Events', stage: 'What you add', hook: 'Three ways to record "something happened"' },
    { file: 'measures.html', label: 'Measures', stage: 'What you add', hook: 'Time the moments only you know matter' },
    { file: 'tracing.html', label: 'Tracing', stage: 'Follow the network', hook: 'Follow one click across the network' },
    { file: 'websockets.html', label: 'WebSockets', stage: 'Follow the network', hook: 'One open socket, one event' },
    { file: 'spa.html', label: 'SPA', stage: 'Single-page apps', hook: 'Take control of route changes yourself' },
    { file: 'replay.html', label: 'Replay', stage: 'Privacy', hook: 'Everything\'s masked, until you say otherwise' }
  ];

  // The guided investigation pages, off the learning path: their own nav group and bonus cards on the home
  // page, but not part of the Up next flow.
  var INVESTIGATIONS = [
    { file: 'noisy-neighbor.html', label: 'Noisy neighbor' },
    { file: 'downstream-culprit.html', label: 'Downstream culprit' },
    { file: 'n-plus-one.html', label: 'N+1' },
    { file: 'bad-deploy.html', label: 'Bad deploy' }
  ];

  // Short labels for the stage menus in the header (the full stage names are too long for the nav).
  var STAGE_NAV = {
    'Start here': 'Start',
    'What you get for free': 'Automatic',
    'What you add': 'Your code',
    'Follow the network': 'Network',
    'Single-page apps': 'SPA',
    'Privacy': 'Privacy'
  };

  var LOGO =
    '<svg viewBox="0 0 246 48" fill="#FDFCF0" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M69.6509 12.1885C65.2049 12.1885 63.0989 14.9965 63.0989 14.9965H62.8649L62.3969 12.6565H57.0149V36.5245H62.8649V22.7185C62.8649 19.6765 64.9709 17.5705 68.0129 17.5705C71.0549 17.5705 73.1609 19.6765 73.1609 22.7185V36.5245H79.0109V22.2505C79.0109 16.1665 75.0329 12.1885 69.6509 12.1885Z"/>' +
    '<path d="M132.741 28.3342H132.405L128.427 12.6562H122.475L118.497 28.3342H118.164L114.183 12.6562H108.099L114.183 36.5242H121.305L125.283 21.0802H125.619L129.597 36.5242H136.719L142.803 12.6562H136.719L132.741 28.3342Z"/>' +
    '<path d="M160.716 14.7622H160.482L160.014 12.6562H155.1V36.5242H160.95V22.7183C160.95 19.6763 162.354 18.2723 165.396 18.2723H168.408V12.6562H164.928C162.12 12.6562 160.716 14.7622 160.716 14.7622Z"/>' +
    '<path d="M181.341 12.1885C174.321 12.1885 169.173 17.3365 169.173 24.5905C169.173 31.8445 174.03 36.9925 181.341 36.9925C187.26 36.9925 190.821 33.5095 192.306 30.9475L186.936 29.0335C186.405 30.0055 184.263 31.8745 181.338 31.8745C177.927 31.8745 175.488 29.7385 175.02 26.4625H192.804C192.804 26.4625 193.038 25.5265 193.038 24.1225C193.038 17.3365 187.89 12.1885 181.338 12.1885H181.341ZM175.023 22.4845C175.725 19.4425 177.831 17.1025 181.341 17.1025C184.617 17.1025 186.723 19.4425 187.191 22.4845H175.023Z"/>' +
    '<path d="M94.92 12.1885C87.9 12.1885 82.752 17.3365 82.752 24.5905C82.752 31.8445 87.609 36.9925 94.92 36.9925C100.839 36.9925 104.4 33.5095 105.885 30.9475L100.515 29.0335C99.9839 30.0055 97.842 31.8745 94.917 31.8745C91.506 31.8745 89.0669 29.7385 88.5989 26.4625H106.383C106.383 26.4625 106.617 25.5265 106.617 24.1225C106.617 17.3365 101.469 12.1885 94.917 12.1885H94.92ZM88.602 22.4845C89.304 19.4425 91.41 17.1025 94.92 17.1025C98.196 17.1025 100.302 19.4425 100.77 22.4845H88.602Z"/>' +
    '<path d="M213.492 3.2334H207.642V9.0834H213.492V3.2334Z"/>' +
    '<path d="M229.635 31.6105C226.125 31.6105 223.317 28.8025 223.317 24.5905C223.317 20.3785 226.125 17.5705 229.635 17.5705C233.145 17.5705 234.549 19.9105 235.017 21.3145L240.315 19.4305C239.034 16.0975 235.884 12.1885 229.638 12.1885C222.618 12.1885 217.47 17.3365 217.47 24.5905C217.47 31.8445 222.618 36.9925 229.638 36.9925C235.935 36.9925 239.088 33.0205 240.348 29.5285L235.02 27.6325C234.552 29.2705 233.148 31.6105 229.638 31.6105H229.635Z"/>' +
    '<path d="M193.689 8.4324H197.01V36.5244H202.86V3.2334H193.689V8.4324Z"/>' +
    '<path d="M213.492 12.6562H207.642V36.5242H213.492V12.6562Z"/>' +
    '<path d="M243.477 31.9346C242.193 31.9346 241.254 32.9066 241.254 34.1906C241.254 35.4746 242.193 36.4466 243.477 36.4466C244.761 36.4466 245.7 35.4746 245.7 34.1906C245.7 32.9066 244.761 31.9346 243.477 31.9346ZM243.477 36.1016C242.379 36.1016 241.596 35.2856 241.596 34.1906C241.596 33.0956 242.379 32.2796 243.477 32.2796C244.575 32.2796 245.358 33.0956 245.358 34.1906C245.358 35.2856 244.575 36.1016 243.477 36.1016Z"/>' +
    '<path d="M244.446 33.782C244.446 33.344 244.101 32.999 243.6 32.999H242.598V35.348H242.943V34.532H243.255L244.071 35.348H244.509L243.693 34.532C244.131 34.502 244.446 34.187 244.446 33.779V33.782ZM242.943 34.19V33.344H243.6C243.912 33.344 244.101 33.533 244.101 33.782C244.101 34.031 243.945 34.19 243.6 34.19H242.943Z"/>' +
    '<path d="M20.652 0.299805L2.41504 10.8268L10.359 15.4138L20.652 9.4738L33.357 16.8088V31.4818L23.067 37.4248V46.5988L41.304 36.0688V12.2218L20.652 0.299805Z"/>' +
    '<path d="M12.708 28.7337V43.4067L20.652 47.9907V24.1467L0 12.2217V21.3957L12.708 28.7337Z"/>' +
    '</svg>';

  // On GitHub Pages the home page is ".../BrowserAgentPlayground/", and on the Node server it is "/".
  function currentFile() { return location.pathname.split('/').pop() || 'index.html'; }

  // Inserts markup where the calling <script> tag sits. Only works while the page is being parsed.
  function writeHere(html) { document.currentScript.insertAdjacentHTML('beforebegin', html); }

  // The learning-path pages grouped by stage (in order), then the investigations as their own group.
  function navGroups() {
    var groups = [], byStage = {};
    PAGES.forEach(function (p) {
      if (!p.stage) return; // Home isn't in a stage
      if (!byStage[p.stage]) { byStage[p.stage] = { label: STAGE_NAV[p.stage] || p.stage, pages: [] }; groups.push(byStage[p.stage]); }
      byStage[p.stage].pages.push(p);
    });
    groups.push({ label: 'Investigations', pages: INVESTIGATIONS });
    return groups;
  }

  function header() {
    var here = currentFile();
    var items = '<a class="nav-link" href="index.html"' + (here === 'index.html' ? ' aria-current="page"' : '') + '>Home</a>';
    navGroups().forEach(function (g, i) {
      var active = g.pages.some(function (p) { return p.file === here; });
      var id = 'navm' + i;
      var links = g.pages.map(function (p) {
        return '<a href="' + p.file + '"' + (p.file === here ? ' aria-current="page"' : '') + '>' + p.label + '</a>';
      }).join('');
      items +=
        '<div class="nav-group' + (active ? ' active' : '') + '">' +
          '<button type="button" class="nav-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="' + id + '">' +
            g.label + '<i class="caret" aria-hidden="true"></i></button>' +
          '<div class="nav-menu" id="' + id + '" hidden>' + links + '</div>' +
        '</div>';
    });
    writeHere(
      '<header class="site"><div class="wrap">' +
        '<div class="brand-row">' +
          '<a class="brand" href="https://newrelic.com" target="_blank" rel="noopener" aria-label="New Relic">' + LOGO + '</a>' +
          '<span class="divider" aria-hidden="true"></span>' +
          '<nav class="switch" aria-label="Pages">' + items + '</nav>' +
        '</div>' +
        '<span id="agentBadge" class="agent-badge" role="status" aria-live="polite"><span class="dot"></span><span id="agentText">Checking for browser agent…</span></span>' +
      '</div></header>');
  }

  // The folded summary line of <details class="who">. demo-identity.js fills in the name and code.
  function whoSummary() {
    writeHere('<summary><span class="who-label">Your data is tagged as</span> <b class="who-name">…</b> ' +
      '<code class="who-code">NR-XXXX</code> <span class="who-change">Change</span></summary>');
  }

  // The name and session code fields. Demo.start() wires them up.
  function identityForm() {
    writeHere(
      '<div class="identity">' +
        '<div class="field"><label for="userName">Your name or handle</label>' +
          '<input id="userName" class="input" type="text" maxlength="40" required autocomplete="nickname" placeholder="e.g. Ada from Platform"></div>' +
        '<div class="field"><label for="sessionCode">Your session code</label>' +
          '<div class="code-row"><input id="sessionCode" class="input" type="text" maxlength="16" spellcheck="false" aria-describedby="codeHint">' +
          '<button id="newCode" class="btn ghost-dark small" type="button" title="Generate a new code">New code</button></div></div>' +
        '<button id="copyCodeTop" class="btn green" type="button">Copy code</button>' +
        '<p class="hint" id="codeHint">Write this code down. You will search for <code class="js-code">NR-XXXX</code> in the queries further down. ' +
          'It stays the same on every page until you click New code or close this tab.</p>' +
      '</div>');
  }

  // The next page on the learning path, at the end of each page. The last page points back home.
  function upNext() {
    var i = -1, here = currentFile();
    PAGES.forEach(function (p, n) { if (p.file === here) i = n; });
    var next = i > 0 ? PAGES[i + 1] : null;
    var stageChange = next && next.stage !== PAGES[i].stage;
    var body = next
      ? '<div class="tag">Up next' + (stageChange ? ' · new stage: ' + next.stage : ' · ' + next.stage) + '</div>' +
        '<h3>' + next.label + ': ' + next.hook + '</h3>' +
        '<a class="btn green small" href="' + next.file + '">Go to ' + next.label + ' <span class="arrow" aria-hidden="true">→</span></a>'
      : '<div class="tag">End of the path</div>' +
        '<h3>You\'ve been through every page.</h3>' +
        '<a class="btn green small" href="index.html#pages">Back to the path <span class="arrow" aria-hidden="true">→</span></a>';
    writeHere('<section class="up-next"><div class="wrap"><div class="up-next-card">' + body + '</div></div></section>');
  }

  // Elements marked data-count="pages" or "stages" show how many there are on the learning path, in words,
  // keeping the capitalization of the text already there. That text is the fallback without JavaScript.
  var NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function pathCounts() {
    var stages = {};
    PAGES.forEach(function (p) { if (p.stage) stages[p.stage] = true; });
    return { pages: PAGES.length - 1, stages: Object.keys(stages).length, investigations: INVESTIGATIONS.length };  // Home isn't a stop on the path
  }
  function fillCounts() {
    var counts = pathCounts();
    Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var n = counts[el.dataset.count];
      if (n === undefined) return;
      var word = NUMBER_WORDS[n] || String(n);
      var capital = /^[A-Z]/.test(el.textContent);
      el.textContent = capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    });
  }
  document.addEventListener('DOMContentLoaded', fillCounts);

  // The header's stage menus: click a trigger to open its dropdown; click away or press Escape to close.
  function setupNav() {
    var triggers = Array.prototype.slice.call(document.querySelectorAll('.nav-trigger'));
    if (!triggers.length) return;
    function menuOf(t) { return document.getElementById(t.getAttribute('aria-controls')); }
    function closeAll(except) {
      triggers.forEach(function (t) {
        if (t === except) return;
        t.setAttribute('aria-expanded', 'false');
        var m = menuOf(t); if (m) m.hidden = true;
      });
    }
    triggers.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = t.getAttribute('aria-expanded') === 'true';
        closeAll(t);
        t.setAttribute('aria-expanded', open ? 'false' : 'true');
        var m = menuOf(t); if (m) m.hidden = open;
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.nav-group')) closeAll(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });
  }
  document.addEventListener('DOMContentLoaded', setupNav);

  // ---- Helpers --------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function agent() { var nr = window.newrelic; return (nr && typeof nr.setCustomAttribute === 'function') ? nr : null; }
  function safe(fn) { try { fn(); } catch (e) { /* never break the demo */ } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function time() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  function renderAgent() {
    var on = !!agent(), badge = $('agentBadge'), text = $('agentText');
    if (!badge) return on;
    badge.classList.toggle('on', on); badge.classList.toggle('off', !on);
    text.textContent = on ? 'Browser agent detected' : 'Browser agent not detected';
    badge.title = text.textContent;
    return on;
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function copyText(text, btn) {
    var done = function () {
      var orig = btn.dataset.label || btn.textContent; btn.dataset.label = orig; btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = orig; }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }

  // A short message at the bottom of the screen, only when the activity feed is below the fold.
  var toastTimer, narrow = window.matchMedia('(max-width: 1180px)');
  function toast(text) {
    var el = $('toast');
    if (!el || !narrow.matches) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  // The activity feed on the right of each demo: newest entry first, capped at `max` entries.
  var feed = {
    add: function (html, max) {
      var empty = $('feedEmpty'); if (empty) empty.remove();
      var li = document.createElement('li');
      li.className = 'entry';
      li.innerHTML = html;
      var list = $('feed');
      list.insertBefore(li, list.firstChild);
      while (list.children.length > (max || 100)) list.removeChild(list.lastChild);
      return li;
    },
    clear: function (text) {
      $('feed').innerHTML = '<li class="feed-empty" id="feedEmpty">' + esc(text || 'Feed cleared. Events already sent stay in New Relic.') + '</li>';
    }
  };

  // ---- Check yourself -------------------------------------------------------------
  // Every answer is recorded as a custom event, so a dashboard can show which questions people get right.
  var QUIZ_EVENT_TYPE = 'DemoQuizAnswer';
  // Custom event attribute values are capped, so long question text is cut short.
  function clip(text) { text = String(text).replace(/\s+/g, ' ').trim(); return text.length > 250 ? text.slice(0, 249) + '…' : text; }

  // The attributes of one answer. The agent adds demoCode, demoUser and the rest of the page's custom attributes.
  function quizAnswer(q, option, attempt) {
    return {
      questionId: q.dataset.qid,
      question: clip(q.querySelector('.q-text').textContent),
      answer: clip(option.textContent),
      outcome: option.hasAttribute('data-correct') ? 'correct' : 'incorrect',
      attempt: attempt,
      demoPage: currentFile()
    };
  }

  // A wrong pick is crossed out and can be retried. The right one shows the explanation and locks the question.
  function initQuiz() {
    Array.prototype.forEach.call(document.querySelectorAll('.quiz .q'), function (q) {
      // The explanation ships hidden in the markup. The feedback paragraph then becomes an empty live region,
      // so screen readers announce "Correct." or "Not quite." when it fills in.
      var attempts = 0, feedback = q.querySelector('.q-feedback'), explanation = feedback.innerHTML;
      feedback.innerHTML = '';
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.hidden = false;
      Array.prototype.forEach.call(q.querySelectorAll('.q-opt'), function (option) {
        option.addEventListener('click', function () {
          attempts++;
          var answer = quizAnswer(q, option, attempts), nr = agent();
          if (nr && typeof nr.recordCustomEvent === 'function') safe(function () { nr.recordCustomEvent(QUIZ_EVENT_TYPE, answer); });
          var correct = answer.outcome === 'correct';
          option.classList.add(correct ? 'right' : 'wrong');
          option.disabled = true;
          if (correct) Array.prototype.forEach.call(q.querySelectorAll('.q-opt'), function (o) { o.disabled = true; });
          feedback.innerHTML = correct
            ? '<b>' + (attempts === 1 ? 'Correct.' : 'That\'s it.') + '</b> ' + explanation
            : '<b>Not quite.</b> Try another answer.';
          feedback.hidden = false;
        });
      });
    });
  }

  // Wires up the name and session code fields, the copy buttons and the agent badge, and keeps the agent's
  // custom attributes in step with them. `state` is the page's own state object: start() reads and updates
  // its name and code. onIdentity(nr) runs after every change (nr is null without an agent), so the page
  // can refresh its queries or set more attributes. onAgent(nr) runs each time a late check finds the agent.
  function start(opts) {
    var state = opts.state;
    var stored = window.DemoIdentity.current();
    if (state.name === undefined) state.name = stored.name;
    if (!state.code) state.code = stored.code;

    function userName() { return state.name || 'anonymous'; }
    function apply() {
      window.DemoIdentity.save({ name: state.name, code: state.code });
      var nr = agent();
      if (nr) {
        safe(function () { nr.setCustomAttribute('demoUser', userName()); });
        safe(function () { nr.setCustomAttribute('demoCode', state.code); });
        if (typeof nr.setUserId === 'function') safe(function () { nr.setUserId(state.name || null); });
      }
      Array.prototype.forEach.call(document.querySelectorAll('.js-code'), function (el) { el.textContent = state.code; });
      if (opts.onIdentity) opts.onIdentity(nr);
    }
    function setCode(code) {
      state.code = window.DemoIdentity.sanitizeCode(code) || window.DemoIdentity.makeCode();
      if ($('sessionCode')) $('sessionCode').value = state.code;
      apply();
    }

    if ($('userName')) {
      var nameTimer;
      $('userName').value = state.name;
      $('userName').addEventListener('input', function (e) {
        state.name = e.target.value.trim(); clearTimeout(nameTimer); nameTimer = setTimeout(apply, 300);
      });
    }
    if ($('sessionCode')) {
      $('sessionCode').value = state.code;
      $('sessionCode').addEventListener('change', function (e) { setCode(e.target.value); });
    }
    if ($('newCode')) $('newCode').addEventListener('click', function () { setCode(window.DemoIdentity.makeCode()); });
    if ($('copyCodeTop')) $('copyCodeTop').addEventListener('click', function (e) { copyText(state.code, e.currentTarget); });
    // "Copy NRQL" buttons copy the element named by data-copy-target, unless it's still a placeholder.
    Array.prototype.forEach.call(document.querySelectorAll('.js-copy'), function (btn) {
      btn.addEventListener('click', function () {
        var target = $(btn.dataset.copyTarget);
        if (!target.classList.contains('placeholder')) copyText(target.textContent, btn);
      });
    });
    setupNrOpen();
    setupNrEntity();

    initQuiz();
    renderAgent();
    apply();
    // The agent can finish loading after the page's own script runs.
    [1000, 3000, 6000].forEach(function (ms) {
      setTimeout(function () {
        if (!renderAgent()) return;
        if (opts.onAgent) opts.onAgent(agent());
        apply();
      }, ms);
    });
    return { apply: apply, setCode: setCode, userName: userName };
  }

  window.Demo = {
    PAGES: PAGES, header: header, whoSummary: whoSummary, identityForm: identityForm, upNext: upNext, pathCounts: pathCounts,
    $: $, agent: agent, safe: safe, esc: esc, time: time, renderAgent: renderAgent,
    copyText: copyText, toast: toast, feed: feed, start: start, QUIZ_EVENT_TYPE: QUIZ_EVENT_TYPE, quizAnswer: quizAnswer,
    nrQueryLink: nrQueryLink, entityLink: entityLink
  };
})();
