// Scripted API monitor: the demo backend is up and its APM agent is attached.
// newrelic/synthetics.sh replaces __SITE_URL__ with the site it monitors when it creates the monitor.
const assert = require('assert');

$http.get({ url: '__SITE_URL__/api/health', headers: { Accept: 'application/json' } }, function (err, response, body) {
  assert.ifError(err);
  assert.equal(response.statusCode, 200, 'Expected 200 from /api/health, got ' + response.statusCode);
  const data = JSON.parse(body).data || {};
  assert.equal(data.ok, true, 'The backend did not report ok');
  // Without the APM agent the Tracing page can't join traces to the backend.
  assert.equal(data.apm, true, 'The backend runs without its New Relic APM agent');
});
