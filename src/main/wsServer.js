const http = require('http');
const crypto = require('crypto');

function sendFrame(socket, payload) {
  if (!socket || socket.destroyed) return;
  const len = payload.length;
  const header = Buffer.alloc(len < 126 ? 2 : len < 65536 ? 4 : 10);
  header[0] = 0x81;
  if (len < 126) header[1] = len;
  else if (len < 65536) { header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  socket.write(Buffer.concat([header, payload]));
}

function readFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0], b1 = buf[1];
  const opcode = b0 & 0x0f;
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  const masked = (b1 & 0x80) !== 0;
  let mask = null;
  if (masked) { if (buf.length < offset + 4) return null; mask = buf.slice(offset, offset + 4); offset += 4; }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (mask) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4]; payload = out; }
  return { opcode, payload, consumed: offset + len };
}

// Minimal RFC 6455 WebSocket server. No dependencies.
function startWsServer({ port, token, onMessage, onClose }) {
  const server = http.createServer((req, res) => { res.writeHead(426); res.end('Upgrade Required'); });
  const clients = new Set();

  server.on('upgrade', (req, socket) => {
    if ((req.headers['upgrade'] || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    try {
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
      );
    } catch (e) { socket.destroy(); return; }

    const client = { socket, authed: false, buffer: Buffer.alloc(0) };
    clients.add(client);
    socket.on('data', (chunk) => {
      client.buffer = Buffer.concat([client.buffer, chunk]);
      while (true) {
        const frame = readFrame(client.buffer);
        if (!frame) break;
        client.buffer = client.buffer.slice(frame.consumed);
        if (frame.opcode === 0x8) { sendFrame(socket, Buffer.from([0x8, 0x0])); socket.end(); break; }
        if (frame.opcode === 0x9) { sendFrame(socket, Buffer.concat([Buffer.from([0x8a, 0x0]), frame.payload])); continue; }
        if (frame.opcode === 0x1) {
          let msg = null;
          try { msg = JSON.parse(frame.payload.toString('utf8')); } catch (e) {}
          if (!msg) continue;
          if (msg.type === 'auth') {
            if (msg.token === token) { client.authed = true; sendFrame(socket, Buffer.from(JSON.stringify({ type: 'auth-ok' }))); }
            else { sendFrame(socket, Buffer.from(JSON.stringify({ type: 'auth-error' }))); socket.end(); break; }
          } else if (client.authed && onMessage) {
            try { onMessage(msg, client); } catch (e) {}
          }
        }
      }
    });
    socket.on('close', () => { clients.delete(client); if (onClose) onClose(client); });
    socket.on('error', () => { clients.delete(client); });
    socket.setTimeout(0);
  });

  server.on('error', (e) => console.error('WebSocket server error:', e.message));
  server.listen(port, '0.0.0.0', () => console.log('WebSocket server on port ' + port));

  return {
    broadcast: (obj) => {
      const data = Buffer.from(JSON.stringify(obj));
      for (const c of clients) { if (c.authed) sendFrame(c.socket, data); }
    },
    close: () => { try { server.close(); } catch (e) {} }
  };
}

module.exports = { startWsServer };