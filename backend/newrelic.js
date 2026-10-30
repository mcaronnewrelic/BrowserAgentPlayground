'use strict';
// New Relic Node.js agent config. Secrets come from environment variables only;
// never commit a license key to this repo (it is published by GitHub Pages).
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'Browser Agent Playground API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  // Sample every trace the browser starts; the demo wants the full span tree each time.
  distributed_tracing: {
    enabled: true,
    sampler: { remote_parent_sampled: 'always_on', remote_parent_not_sampled: 'always_on' }
  },
  // Logs in context: newrelic.recordLogEvent() forwards each request log with
  // trace.id / span.id, so it shows up on the trace next to the browser's logs.
  application_logging: { enabled: true, forwarding: { enabled: true } },
  logging: { level: process.env.NEW_RELIC_LOG_LEVEL || 'info', filepath: 'stdout' },
  allow_all_headers: true,
  // Ignore the dashboard-deeplink endpoint from APM (it's an internal utility, not part of the demo)
  rules: {
    ignore: [
      '/api/dashboard-deeplink'
    ]
  },
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
};
