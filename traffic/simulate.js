// Simulated visitors for the demo site: real browsers (Chromium, Firefox, WebKit) with desktop and phone
// profiles, each visitor with a name, walking part of the learning path, clicking around and answering
// the Check yourself questions. Runs forever; see traffic/README.md.
//
// Simulated visitors use session codes starting SIM-, so queries can include or exclude them:
//   ... WHERE demoCode LIKE 'SIM-%'      or      ... WHERE demoCode NOT LIKE 'SIM-%'
'use strict';
const { chromium, firefox, webkit, devices } = require('playwright');

const SITE = (process.env.SITE_URL || 'https://browser.nru.to').replace(/\/+$/, '');
const VISITS_PER_HOUR = Number(process.env.VISITS_PER_HOUR) || 30;
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 2);
// For a test run: stop after this many visits instead of running forever.
const VISITS = Number(process.env.VISITS) || 0;
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1; // below 1 shortens every pause (tests)

// Weighted roughly like real desktop and mobile traffic.
const PROFILES = [
  { label: 'Chrome on desktop', engine: chromium, device: 'Desktop Chrome', weight: 35 },
  { label: 'Edge on desktop', engine: chromium, device: 'Desktop Edge', weight: 12 },
  { label: 'Firefox on desktop', engine: firefox, device: 'Desktop Firefox', weight: 10 },
  { label: 'Safari on desktop', engine: webkit, device: 'Desktop Safari', weight: 13 },
  { label: 'Safari on iPhone', engine: webkit, device: 'iPhone 14', weight: 18 },
  { label: 'Chrome on Android', engine: chromium, device: 'Pixel 7', weight: 12 }
];

const NAMES = [
  'Ada from Platform', 'Ben (SRE)', 'Chen Wei', 'Dana from Checkout', 'Elif', 'Farah from Mobile', 'Gabriel',
  'Hana from Frontend', 'Ivan', 'Jasmine (QA)', 'Kofi from Payments', 'Lena', 'Mateo from Growth', 'Nadia',
  'Omar (DevOps)', 'Priya from Search', 'Quinn', 'Rosa from Support', 'Sven', 'Tariq from Data', 'Uma',
  'Victor (Architect)', 'Wen from Web', 'Ximena', 'Yusuf from Infra', 'Zoe', 'Aiko from Design', 'Bruno',
  'Carmen (PM)', 'Dmitri', 'Esther from Ops', 'Felix', 'Grace from Security', 'Hiro', 'Isla from Billing'
];

// The learning path, in order (PAGES in site.js), and how likely a visitor is to leave after each page.
const PATH = ['install.html', 'vitals.html', 'errors.html', 'frustration.html', 'logs.html', 'events.html',
  'measures.html', 'tracing.html', 'websockets.html', 'spa.html', 'replay.html'];
const LEAVE_AFTER_PAGE = 0.16;
const JUMP_AHEAD = 0.1;

// Buttons a visitor never clicks: they reload or leave the page, or only manage this page's own feed and code.
const SKIP_BUTTONS = ['leaveBtn', 'applyModes', 'allGood', 'allPoor', 'clearFeed', 'newCode', 'copyCodeTop'];

const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * TIME_SCALE));
function pickWeighted(list) {
  let n = Math.random() * list.reduce((s, x) => s + x.weight, 0);
  return list.find((x) => (n -= x.weight) < 0) || list[0];
}
function sessionCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'SIM-' + Array.from({ length: 4 }, () => pick(alphabet)).join('');
}
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Fewer visitors overnight, Pacific time: a rough office-hours curve between 25% and 100%.
function hourlyFactor(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(date));
  const curve = [0.25, 0.25, 0.25, 0.25, 0.3, 0.4, 0.55, 0.75, 0.9, 1, 1, 1, 0.95, 1, 1, 0.95, 0.85, 0.7, 0.55, 0.45, 0.4, 0.35, 0.3, 0.25];
  return curve[hour];
}

// One browser per engine, started on first use and restarted if it crashes.
const browsers = new Map();
async function browserFor(engine) {
  let b = browsers.get(engine);
  if (!b || !b.isConnected()) {
    b = await engine.launch();
    browsers.set(engine, b);
  }
  return b;
}

// ---- What a visitor does on a page --------------------------------------------------------------------

// Clicks a few of the page's own buttons in its "Try it" section, with pauses like a person reading.
async function playWithPage(page, file) {
  const clicks = Math.round(rand(1, 5));
  for (let i = 0; i < clicks; i++) {
    const buttons = await page.$$('#try button:not([disabled])');
    const usable = [];
    for (const b of buttons) {
      const id = await b.getAttribute('id');
      const cls = (await b.getAttribute('class')) || '';
      if (SKIP_BUTTONS.includes(id) || cls.includes('js-copy') || !(await b.isVisible())) continue;
      usable.push(b);
    }
    if (!usable.length) return;
    const button = pick(usable);
    // Sometimes people mash a slow button: four quick clicks is a rage click.
    const repeats = file === 'frustration.html' && chance(0.4) ? 5 : 1;
    for (let r = 0; r < repeats; r++) await button.click({ timeout: 3000, noWaitAfter: true }).catch(() => {});
    await sleep(rand(1500, 6000));
  }
}

// Answers the Check yourself questions. Each visitor has their own accuracy, and some retry after a miss.
async function answerQuiz(page, skill) {
  const questions = await page.$$('.quiz .q');
  for (const q of questions) {
    if (!chance(0.8)) continue; // skips the odd question
    await q.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(rand(3000, 9000)); // reading the question
    const right = await q.$('.q-opt[data-correct]');
    const wrong = await q.$$('.q-opt:not([data-correct])');
    if (chance(skill) || !wrong.length) {
      await right.click({ timeout: 3000 }).catch(() => {});
    } else {
      await pick(wrong).click({ timeout: 3000 }).catch(() => {});
      if (chance(0.7)) { await sleep(rand(2000, 5000)); await right.click({ timeout: 3000 }).catch(() => {}); }
    }
  }
}

// ---- One visit ----------------------------------------------------------------------------------------------

async function visit(n) {
  const profile = pickWeighted(PROFILES);
  const name = pick(NAMES);
  const code = sessionCode();
  const skill = rand(0.45, 0.95);
  const browser = await browserFor(profile.engine);
  const context = await browser.newContext({ ...devices[profile.device], locale: 'en-US' });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const seen = [];
  try {
    // Home: enter a name and code, then start the path.
    await page.goto(SITE + '/', { waitUntil: 'load' });
    await sleep(rand(3000, 10000));
    await page.fill('#userName', name);
    await page.fill('#sessionCode', code);
    await page.dispatchEvent('#sessionCode', 'change');
    await Promise.all([page.waitForURL(/install\.html/), page.click('#startForm button[type="submit"]')]);

    let index = 0;
    for (;;) {
      const file = PATH[index];
      seen.push(file.replace('.html', ''));
      await sleep(rand(4000, 12000)); // reading the top of the page
      await playWithPage(page, file);
      if (chance(0.6)) await answerQuiz(page, skill);
      if (index === PATH.length - 1 || chance(LEAVE_AFTER_PAGE)) break;
      if (chance(JUMP_AHEAD) && index < PATH.length - 2) {
        index += 2; // skips a page, straight from the nav
        await page.goto(SITE + '/' + PATH[index], { waitUntil: 'load' });
      } else {
        index += 1;
        await Promise.all([page.waitForURL(new RegExp(PATH[index].replace('.', '\\.'))), page.click('.up-next-card a')]);
      }
    }
    log(`visit ${n}: ${name} (${code}), ${profile.label}, ${seen.length} pages: ${seen.join(' > ')}`);
  } catch (e) {
    log(`visit ${n}: ${name} (${code}), ${profile.label}, stopped after ${seen.join(' > ') || 'home'}: ${e.message.split('\n')[0]}`);
  } finally {
    await sleep(2000); // lets the agent send what it has before the page goes away
    await page.close({ runBeforeUnload: true }).catch(() => {});
    await context.close().catch(() => {});
  }
}

// ---- Schedule ------------------------------------------------------------------------------------------------

let running = 0, started = 0, stopping = false;
async function main() {
  log(`Simulating visitors on ${SITE}: about ${VISITS_PER_HOUR} visits an hour at peak, up to ${CONCURRENCY} at a time.`);
  const done = [];
  while (!stopping && (!VISITS || started < VISITS)) {
    if (running < CONCURRENCY) {
      running++; started++;
      done.push(visit(started).finally(() => { running--; }));
    }
    // Random gaps (exponential), so visits arrive unevenly the way real ones do.
    const meanGapMs = 3600000 / (VISITS_PER_HOUR * hourlyFactor());
    await sleep(Math.min(-Math.log(1 - Math.random()) * meanGapMs, meanGapMs * 4));
  }
  await Promise.allSettled(done);
  for (const b of browsers.values()) await b.close().catch(() => {});
  log('Stopped.');
}

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; log(`${signal}: finishing current visits`); });
main().catch((e) => { console.error(e); process.exit(1); });
