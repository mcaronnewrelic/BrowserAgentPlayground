// Run: node --test backend/websocket.test.js   (no install needed)
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const { createServer } = require('./server.js');
const { acceptKey, parseFrames, GREETING } = require('./websocket.js');

// Browsers must mask every frame they send.
function clientFrame(opcode, payload, { masked = true, fin = true } = {}) {
  payload = Buffer.from(payload || '');
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0, len]) : Buffer.from([0, 126, len >> 8, len & 0xff]);
  head[0] = (fin ? 0x80 : 0) | opcode;
  if (!masked) return Buffer.concat([head, payload]);
  head[1] |= 0x80;
  const mask = crypto.randomBytes(4);
  return Buffer.concat([head, mask, Buffer.from(payload.map((b, i) => b ^ mask[i & 3]))]);
}

// Connects with a raw upgrade request and collects the server's (unmasked) frames.
function connect(base, path) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request(base + path, { headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
    req.on('error', reject);
    req.on('response', (res) => resolve({ status: res.statusCode }));
    req.on('upgrade', (res, socket, head) => {
      const frames = [], waiters = [];
      let buf = Buffer.from(head || []);
      const ended = new Promise((r) => socket.on('close', r));
      function drain() {
        while (buf.length >= 2) {
          let len = buf[1] & 0x7f, pos = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); pos = 4; }
          if (buf.length < pos + len) return;
          frames.push({ opcode: buf[0] & 0x0f, payload: buf.subarray(pos, pos + len) });
          buf = buf.subarray(pos + len);
        }
      }
      socket.on('data', (c) => { buf = Buffer.concat([buf, c]); drain(); while (waiters.length && frames.length) waiters.shift()(frames.shift()); });
      drain();
      const next = () => frames.length ? Promise.resolve(frames.shift()) : new Promise((r) => waiters.push(r));
      resolve({ status: res.statusCode, accept: res.headers['sec-websocket-accept'], expected: acceptKey(key), socket, next, ended });
    });
    req.end();
  });
}

async function withServer(nr, fn) {
  const server = createServer({ nr, allowedOrigins: [], stdout: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { await fn('http://127.0.0.1:' + server.address().port); } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
}

function fakeNewRelic() {
  const logs = [];
  return { logs, recordLogEvent: (e) => logs.push(e), getLinkingMetadata: () => ({}) };
}

async function until(check) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check(), 'condition never became true');
}

test('accept key matches the RFC 6455 example', () => {
  assert.strictEqual(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('parseFrames waits for the rest of a frame split across chunks', () => {
  const frame = clientFrame(0x1, 'hello');
  const first = parseFrames(frame.subarray(0, 5), 1024);
  assert.strictEqual(first.frames.length, 0);
  const second = parseFrames(Buffer.concat([first.rest, frame.subarray(5)]), 1024);
  assert.strictEqual(second.frames[0].payload.toString(), 'hello');
  assert.strictEqual(second.rest.length, 0);
});

test('/ws greets, echoes text and binary, and repeats the close code and reason', async () => {
  const nr = fakeNewRelic();
  await withServer(nr, async (base) => {
    const ws = await connect(base, '/ws?demoCode=NR-AB12&demoUser=Ada');
    assert.strictEqual(ws.status, 101);
    assert.strictEqual(ws.accept, ws.expected);
    assert.strictEqual((await ws.next()).payload.toString(), GREETING);

    ws.socket.write(clientFrame(0x1, 'hello'));
    const text = await ws.next();
    assert.deepStrictEqual([text.opcode, text.payload.toString()], [0x1, 'hello']);

    const bytes = crypto.randomBytes(300);
    ws.socket.write(clientFrame(0x2, bytes));
    const binary = await ws.next();
    assert.strictEqual(binary.opcode, 0x2);
    assert.ok(binary.payload.equals(bytes));

    const body = Buffer.concat([Buffer.from([0x0f, 0xa0]), Buffer.from('Demo: user signed out')]); // 4000
    ws.socket.write(clientFrame(0x8, body));
    const close = await ws.next();
    assert.strictEqual(close.opcode, 0x8);
    assert.strictEqual(close.payload.readUInt16BE(0), 4000);
    assert.strictEqual(close.payload.subarray(2).toString(), 'Demo: user signed out');
    await ws.ended;
  });
  await until(() => nr.logs.length === 1);
  const log = nr.logs[0];
  assert.strictEqual(log.route, 'ws');
  assert.strictEqual(log.level, 'INFO');
  assert.strictEqual(log.demoCode, 'NR-AB12');
  assert.strictEqual(log.demoUser, 'Ada');
  assert.strictEqual(log.closeCode, 4000);
  assert.strictEqual(log.closeReason, 'Demo: user signed out');
  assert.strictEqual(log.closedBy, 'client');
  assert.deepStrictEqual([log.messagesIn, log.bytesIn, log.messagesOut], [2, 305, 3]);
  assert.match(log.message, /^WebSocket \/ws closed 4000 "Demo: user signed out" by client after \d+ ms$/);
});

test('fragmented messages are joined before they are echoed', async () => {
  await withServer(null, async (base) => {
    const ws = await connect(base, '/ws');
    await ws.next();
    ws.socket.write(Buffer.concat([clientFrame(0x1, 'hel', { fin: false }), clientFrame(0x0, 'lo')]));
    assert.strictEqual((await ws.next()).payload.toString(), 'hello');
    ws.socket.destroy();
  });
});

test('pings are answered with a pong carrying the same payload', async () => {
  await withServer(null, async (base) => {
    const ws = await connect(base, '/ws');
    await ws.next();
    ws.socket.write(clientFrame(0x9, 'are you there'));
    const pong = await ws.next();
    assert.deepStrictEqual([pong.opcode, pong.payload.toString()], [0xA, 'are you there']);
    ws.socket.destroy();
  });
});

test('unmasked frames close the connection with 1002 and log a WARN', async () => {
  const nr = fakeNewRelic();
  await withServer(nr, async (base) => {
    const ws = await connect(base, '/ws');
    await ws.next();
    ws.socket.write(clientFrame(0x1, 'hello', { masked: false }));
    const close = await ws.next();
    assert.strictEqual(close.payload.readUInt16BE(0), 1002);
    await ws.ended;
  });
  await until(() => nr.logs.length === 1);
  assert.strictEqual(nr.logs[0].level, 'WARN');
  assert.strictEqual(nr.logs[0].closedBy, 'server');
});

test('messages over 64 KB close the connection with 1009', async () => {
  await withServer(null, async (base) => {
    const ws = await connect(base, '/ws');
    await ws.next();
    const head = Buffer.from([0x82, 0x80 | 127, 0, 0, 0, 0, 0, 2, 0, 0]); // 128 KB, masked
    ws.socket.write(head);
    assert.strictEqual((await ws.next()).payload.readUInt16BE(0), 1009);
    await ws.ended;
  });
});

test('a dropped connection is logged with 1006', async () => {
  const nr = fakeNewRelic();
  await withServer(nr, async (base) => {
    const ws = await connect(base, '/ws');
    await ws.next();
    ws.socket.destroy();
    await until(() => nr.logs.length === 1);
  });
  assert.strictEqual(nr.logs[0].closeCode, 1006);
  assert.strictEqual(nr.logs[0].closedBy, 'network');
  assert.strictEqual(nr.logs[0].level, 'WARN');
});

test('upgrades to any other path are refused', async () => {
  await withServer(null, async (base) => {
    assert.strictEqual((await connect(base, '/api/products')).status, 404);
  });
});
