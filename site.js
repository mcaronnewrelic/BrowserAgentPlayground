// Shared by every page: the site header and page switcher, the "Your data is tagged as" panel, and the
// helpers every demo uses (agent badge, name and session code, copy buttons, toast, activity feed).
// Load it in <head> after demo-identity.js. Demo.header(), Demo.whoSummary() and Demo.identityForm()
// write their markup in place of the <script> tag that calls them, while the page is still loading, so
// nothing shifts once it has rendered.
(function () {
  'use strict';

  // The page switcher. Add a page here and it shows up in every header.
  var PAGES = [
    { file: 'index.html', label: 'Home' },
    { file: 'install.html', label: 'Install' },
    { file: 'logs.html', label: 'Logs' },
    { file: 'errors.html', label: 'Errors' },
    { file: 'tracing.html', label: 'Tracing' },
    { file: 'websockets.html', label: 'WebSockets' },
    { file: 'vitals.html', label: 'Vitals' },
    { file: 'measures.html', label: 'Measures' },
    { file: 'frustration.html', label: 'Frustration' },
    { file: 'events.html', label: 'Events' },
    { file: 'replay.html', label: 'Replay' },
    { file: 'spa.html', label: 'SPA' }
  ];

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

  // On GitHub Pages the home page is ".../BrowserLogsDemo/", and on the Node server it is "/".
  function currentFile() { return location.pathname.split('/').pop() || 'index.html'; }

  // Inserts markup where the calling <script> tag sits. Only works while the page is being parsed.
  function writeHere(html) { document.currentScript.insertAdjacentHTML('beforebegin', html); }

  function header() {
    var here = currentFile();
    var links = PAGES.map(function (p) {
      return '<a href="' + p.file + '"' + (p.file === here ? ' aria-current="page"' : '') + '>' + p.label + '</a>';
    }).join('');
    writeHere(
      '<header class="site"><div class="wrap">' +
        '<div class="brand-row">' +
          '<a class="brand" href="https://newrelic.com" target="_blank" rel="noopener" aria-label="New Relic">' + LOGO + '</a>' +
          '<span class="divider" aria-hidden="true"></span>' +
          '<nav class="switch" aria-label="Demo pages">' + links + '</nav>' +
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

  // The page switcher scrolls sideways when it doesn't fit, so bring the current page's tab into view.
  function centerCurrentTab() {
    var nav = document.querySelector('.switch'), tab = nav && nav.querySelector('[aria-current="page"]');
    if (!tab || nav.scrollWidth <= nav.clientWidth) return;
    var left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
    nav.scrollLeft = left - (nav.clientWidth - tab.offsetWidth) / 2;
  }
  document.addEventListener('DOMContentLoaded', centerCurrentTab);
  // Tab widths change once the web fonts arrive, so center again when they have.
  window.addEventListener('load', function () {
    centerCurrentTab();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(centerCurrentTab);
  });

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
      // The explanation ships hidden in the markup and is shown once the right answer is picked.
      var attempts = 0, feedback = q.querySelector('.q-feedback'), explanation = feedback.innerHTML;
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
    PAGES: PAGES, header: header, whoSummary: whoSummary, identityForm: identityForm,
    $: $, agent: agent, safe: safe, esc: esc, time: time, renderAgent: renderAgent,
    copyText: copyText, toast: toast, feed: feed, start: start, QUIZ_EVENT_TYPE: QUIZ_EVENT_TYPE, quizAnswer: quizAnswer
  };
})();
