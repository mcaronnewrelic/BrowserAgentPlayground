// Scripted browser monitor: the site works end to end, and the home page loads within budget.
// newrelic/synthetics.sh replaces __SITE_URL__ with the site it monitors when it creates the monitor.
//
// It signs in as "Synthetic check", so dashboards can leave its visits out (demoUser = 'Synthetic check').
const assert = require('assert');
const By = $selenium.By;
const until = $selenium.until;

const SITE = '__SITE_URL__';
const HOME_LOAD_BUDGET_MS = 5000;
const WAIT_MS = 20000;

// The site scrolls smoothly (scroll-behavior: smooth), so WebDriver's own scroll before a click is still
// animating when it clicks, and the click lands where the element used to be. Scroll instantly first.
async function click(element) {
  await $webDriver.executeScript("arguments[0].scrollIntoView({ block: 'center', behavior: 'instant' });", element);
  await element.click();
}

// 1. The home page is up and loads within budget.
await $webDriver.get(SITE + '/');
const loadMs = await $webDriver.executeScript(
  "var n = performance.getEntriesByType('navigation')[0]; return n ? Math.round(n.loadEventEnd) : 0;");
assert.ok(loadMs > 0, 'Could not read the home page load time');
assert.ok(loadMs <= HOME_LOAD_BUDGET_MS, 'Home page took ' + loadMs + ' ms to load, over the ' + HOME_LOAD_BUDGET_MS + ' ms budget');

// 2. Starting the learning path works: name in, start, and the Install page has a running agent.
await $webDriver.findElement(By.id('userName')).sendKeys('Synthetic check');
await click(await $webDriver.findElement(By.css('#startForm button[type="submit"]')));
await $webDriver.wait(until.urlContains('install.html'), WAIT_MS, 'Start did not open the Install page');
await $webDriver.wait(until.elementLocated(By.css('#agentBadge.on')), WAIT_MS, 'The browser agent did not load on the Install page');

// 3. The Tracing page reaches the backend and the backend joins the browser's trace.
await $webDriver.get(SITE + '/tracing.html');
const button = await $webDriver.wait(until.elementLocated(By.css('#singleButtons .req-btn')), WAIT_MS, 'Tracing buttons did not render');
await click(button);
const status = await $webDriver.wait(until.elementLocated(By.css('#feed .entry .status')), WAIT_MS, 'The request never finished');
// getText() returns the text as displayed, and the status chip is styled in capitals.
const text = (await status.getText()).trim();
assert.equal(text.toLowerCase(), 'backend joined trace', 'Tracing request status was "' + text + '"');
