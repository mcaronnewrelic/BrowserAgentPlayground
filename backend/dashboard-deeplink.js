'use strict';
/**
 * Create New Relic dashboard deeplinks with template variables pre-set.
 *
 * Based on the Python nr-dashboard-deeplink.py utility, this module provides
 * dashboard deeplink generation for Node.js environments.
 *
 * Required environment variables:
 *   - NEW_RELIC_API_KEY: New Relic user API key (NRAK-...)
 *
 * Optional environment variables:
 *   - NR_ENV: New Relic environment, "us" or "eu" (default: "us")
 */

const http = require('node:http');
const https = require('node:https');

const ENVS = {
  us: {
    hurl: 'https://hurl.service.newrelic.com/url',
    base: 'https://one.newrelic.com',
  },
  eu: {
    hurl: 'https://hurl.service.eu.newrelic.com/url',
    base: 'https://one.eu.newrelic.com',
  },
};

/**
 * Create a New Relic dashboard deeplink URL with template variables.
 *
 * @param {Object} options
 * @param {string} options.apiKey - New Relic user API key (NRAK-...)
 * @param {string} options.env - Environment: "us" or "eu" (default: "us")
 * @param {number} options.account - Account ID
 * @param {string} options.guid - Dashboard entity GUID
 * @param {Object} options.variables - Template variables, e.g. { "Customer": "Acme Inc", "Site": "us-east" }
 * @param {string} [options.filter] - Entity filter bar value, e.g. "tags.env = production"
 * @param {number} [options.duration] - Relative time window in ms (default: 1800000 = 30 min)
 * @returns {Promise<string>} The full dashboard deeplink URL
 * @throws {Error} If the request fails or required parameters are missing
 */
async function createDashboardDeeplink(options) {
  const { apiKey, env = 'us', account, guid, variables = {}, filter, duration = 1800000 } = options;

  if (!apiKey) throw new Error('apiKey is required');
  if (!account) throw new Error('account is required');
  if (!guid) throw new Error('guid is required');
  if (!ENVS[env]) throw new Error(`env must be "us" or "eu", got "${env}"`);

  const envConfig = ENVS[env];

  // Convert variables object to the format NR Hurl expects: { name: [value] }
  const selectedVariables = {};
  for (const [name, value] of Object.entries(variables)) {
    selectedVariables[name] = [String(value)];
  }

  const body = {
    launcher: { id: 'dashboards.launcher', urlState: {} },
    main: {
      id: 'dashboards.detail',
      urlState: {
        entityGuid: guid,
        selectedVariables,
        ...(filter ? { filter } : {}),
      },
    },
    platformState: {
      accountId: account,
      timeRange: { duration },
    },
  };

  return new Promise((resolve, reject) => {
    const url = new URL(envConfig.hurl);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          const path = data.trim();
          resolve(`${envConfig.base}${path}`);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

module.exports = { createDashboardDeeplink };
