'use strict';
// Serves the demo's HTML pages and assets so they share an origin with the API (no CORS).
// In each page, the block between the NR:SNIPPET markers is the static browser agent
// snippet used on GitHub Pages. Here it is swapped for the APM agent's own header, so the
// pages report to whichever account the license key belongs to.
const fs = require('node:fs/promises');
const path = require('node:path');

const SNIPPET_BLOCK = /<!-- NR:SNIPPET -->[\s\S]*?<!-- \/NR:SNIPPET -->/;
const NOT_SERVED_SEGMENTS = new Set(['backend', 'node_modules']);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const SAME_ORIGIN_BACKEND = '<meta name="demo-backend" content="same-origin">';

// getBrowserTimingHeader() answers with an HTML comment when it cannot build a header.
const isScriptHeader = (header) => typeof header === 'string' && header.includes('<script');

function createPages({ root, getBrowserHeader }) {
  const base = path.resolve(root);

  function fileFor(urlPath) {
    let relative;
    try { relative = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).slice(1); } catch (e) { return null; }
    const segments = relative.split(/[\\/]/);
    if (segments.some((s) => s.startsWith('.') || NOT_SERVED_SEGMENTS.has(s))) return null;
    if (!CONTENT_TYPES[path.extname(relative).toLowerCase()]) return null;
    const file = path.resolve(base, relative);
    return file.startsWith(base + path.sep) ? file : null;
  }

  // The static snippet carries the repo owner's account, so it never ships from here.
  // The meta tag tells tracing.html that this origin also serves the API.
  function swapSnippet(html, header) {
    const agent = isScriptHeader(header) ? header : '<!-- NR: no browser agent header available yet -->';
    return html.replace(SNIPPET_BLOCK, () => SAME_ORIGIN_BACKEND + '\n' + agent);
  }

  // Returns true when it answered the request.
  async function handle(req, res, urlPath, nameTransaction) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const file = fileFor(urlPath);
    if (!file) return false;
    let body;
    try { body = await fs.readFile(file); } catch (e) { return false; }

    const extension = path.extname(file).toLowerCase();
    const isPage = extension === '.html';
    // The header needs a named transaction, and it is different on every request.
    nameTransaction(isPage ? 'pages/' + path.basename(file) : 'pages/static');
    if (isPage) body = swapSnippet(body.toString('utf8'), getBrowserHeader());

    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension],
      'Cache-Control': isPage ? 'no-store' : 'public, max-age=300'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  return { handle, swapSnippet };
}

module.exports = { createPages };
