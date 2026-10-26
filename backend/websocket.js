'use strict';
// WebSocket echo endpoint for websockets.html. Written against RFC 6455 directly so the
// backend keeps zero dependencies. It sends one greeting, echoes every text and binary
// message, answers pings, and repeats the client's close code and reason in its own close
// frame (that is what the browser reports as CloseEvent.code / .reason). When a connection
// ends it calls onClose once with a summary, which server.js turns into a log line.
const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP = { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };
const GREETING = 'Connected to the demo backend. Everything you send comes back.';
const DEFAULTS = { path: '/ws', maxMessageBytes: 64 * 1024, idleMs: 5 * 60 * 1000, maxLifetimeMs: 15 * 60 * 1000 };

class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

// Server frames are never masked or fragmented.
function encodeFrame(opcode, payload) {
  payload = payload || Buffer.alloc(0);
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

// Reads every complete frame in buf. Returns the frames and the bytes left over for the next chunk.
function parseFrames(buf, maxBytes) {
  const frames = [];
  let offset = 0;
  while (buf.length - offset >= 2) {
    const b0 = buf[offset], b1 = buf[offset + 1];
    if (b0 & 0x70) throw new ProtocolError(1002, 'Reserved bits set');
    if (!(b1 & 0x80)) throw new ProtocolError(1002, 'Client frames must be masked');
    let len = b1 & 0x7f, pos = offset + 2;
    if (len === 126) {
      if (buf.length < pos + 2) break;
      len = buf.readUInt16BE(pos); pos += 2;
    } else if (len === 127) {
      if (buf.length < pos + 8) break;
      const big = buf.readBigUInt64BE(pos); pos += 8;
      if (big > BigInt(maxBytes)) throw new ProtocolError(1009, 'Message too big');
      len = Number(big);
    }
    if (len > maxBytes) throw new ProtocolError(1009, 'Message too big');
    if (buf.length < pos + 4 + len) break;
    const mask = buf.subarray(pos, pos + 4); pos += 4;
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) payload[i] = buf[pos + i] ^ mask[i & 3];
    frames.push({ fin: Boolean(b0 & 0x80), opcode: b0 & 0x0f, payload });
    offset = pos + len;
  }
  return { frames, rest: buf.subarray(offset) };
}

function rejectUpgrade(socket, status) {
  socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

function attachWebSocket(server, opts) {
  opts = Object.assign({}, DEFAULTS, opts);
  const onClose = opts.onClose || function () {};

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => { /* a reset connection still ends through 'close' */ });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.replace(/\/+$/, '') !== opts.path) return rejectUpgrade(socket, '404 Not Found');
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') return rejectUpgrade(socket, '400 Bad Request');

    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + acceptKey(key) + '\r\n\r\n');
    socket.setNoDelay(true);

    const stats = {
      path: url.pathname, query: url.searchParams,
      messagesIn: 0, bytesIn: 0, messagesOut: 0, bytesOut: 0,
      closeCode: 1006, closeReason: '', closedBy: 'network'
    };
    // A monotonic clock, so a wall-clock correction while the socket is open can't skew durationMs.
    const openedAt = performance.now();
    let pending = Buffer.alloc(0), fragments = null, fragmentOpcode = 0, closing = false, reported = false;

    function send(opcode, payload) {
      if (socket.destroyed) return;
      socket.write(encodeFrame(opcode, payload));
      if (opcode === OP.TEXT || opcode === OP.BINARY) { stats.messagesOut++; stats.bytesOut += payload.length; }
    }
    function close(code, reason, closedBy) {
      if (closing) return;
      closing = true;
      stats.closeCode = code; stats.closeReason = reason || ''; stats.closedBy = closedBy;
      const body = Buffer.alloc(2); body.writeUInt16BE(code, 0);
      send(OP.CLOSE, Buffer.concat([body, Buffer.from(stats.closeReason, 'utf8')]));
      socket.end();
    }

    const idle = () => close(1001, 'Idle for too long', 'server');
    socket.setTimeout(opts.idleMs, idle);
    const lifetime = setTimeout(() => close(1001, 'Connection open too long', 'server'), opts.maxLifetimeMs);
    lifetime.unref();

    function onMessage(opcode, payload) {
      stats.messagesIn++; stats.bytesIn += payload.length;
      send(opcode, payload);
    }

    function onFrame(frame) {
      switch (frame.opcode) {
        case OP.TEXT:
        case OP.BINARY:
          if (fragments) throw new ProtocolError(1002, 'Expected a continuation frame');
          if (frame.fin) return onMessage(frame.opcode, frame.payload);
          fragments = [frame.payload]; fragmentOpcode = frame.opcode;
          return;
        case OP.CONTINUATION: {
          if (!fragments) throw new ProtocolError(1002, 'Unexpected continuation frame');
          fragments.push(frame.payload);
          const size = fragments.reduce((n, b) => n + b.length, 0);
          if (size > opts.maxMessageBytes) throw new ProtocolError(1009, 'Message too big');
          if (frame.fin) { const whole = Buffer.concat(fragments); fragments = null; onMessage(fragmentOpcode, whole); }
          return;
        }
        case OP.PING: return send(OP.PONG, frame.payload);
        case OP.PONG: return;
        case OP.CLOSE: {
          // Echo the client's code and reason. A close frame with no code is answered with an empty one.
          const p = frame.payload;
          const code = p.length >= 2 ? p.readUInt16BE(0) : 1005;
          const reason = p.length > 2 ? p.subarray(2).toString('utf8') : '';
          if (code === 1005) {
            closing = true;
            stats.closeCode = 1005; stats.closedBy = 'client';
            send(OP.CLOSE, Buffer.alloc(0));
            socket.end();
            return;
          }
          return close(code, reason, 'client');
        }
        default:
          throw new ProtocolError(1002, 'Unknown opcode ' + frame.opcode);
      }
    }

    function onData(chunk) {
      if (closing) return;
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      try {
        const parsed = parseFrames(pending, opts.maxMessageBytes);
        pending = Buffer.from(parsed.rest);
        for (const frame of parsed.frames) { if (closing) break; onFrame(frame); }
      } catch (err) {
        if (err instanceof ProtocolError) close(err.code, err.message, 'server');
        else { socket.destroy(); }
      }
    }

    socket.on('data', onData);
    // The HTTP server allows half-open sockets, so a client that drops the connection without a
    // close frame would otherwise linger until the idle timeout. End our side as soon as it ends its.
    socket.on('end', () => socket.end());
    socket.on('close', () => {
      clearTimeout(lifetime);
      if (reported) return;
      reported = true;
      stats.durationMs = Math.round(performance.now() - openedAt);
      try { onClose(stats); } catch (e) { /* never break the demo */ }
    });

    send(OP.TEXT, Buffer.from(GREETING, 'utf8'));
    if (head && head.length) onData(head);
  });
}

module.exports = { attachWebSocket, parseFrames, encodeFrame, acceptKey, GREETING };
