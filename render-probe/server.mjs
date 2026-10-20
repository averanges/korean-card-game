import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {WebSocketServer, WebSocket} from 'ws';

// Standalone connectivity probe. Imports no game, room or Worker modules.
export function createProbe() {
  const instanceId = randomUUID(), started = Date.now();
  const files = new Map([
    ['/', ['diagnostics.html', 'text/html; charset=utf-8']],
    ['/diagnostics.html', ['diagnostics.html', 'text/html; charset=utf-8']],
    ['/diagnostics.js', ['diagnostics.js', 'text/javascript; charset=utf-8']]
  ]);
  const server = createServer(async (req, res) => {
    // Public diagnostics only: no cookies, credentials, rooms or private data.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(req.url, 'http://probe.local').pathname;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {'Access-Control-Allow-Methods': 'GET, OPTIONS'}); res.end(); return;
    }
    if (req.method !== 'GET') { res.writeHead(405, {Allow: 'GET, OPTIONS'}); res.end(); return; }
    if (path === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({ok: true, service: 'hangul-durak-render-probe', version: 1, instanceId, uptimeSeconds: Math.floor((Date.now() - started) / 1000)}));
      return;
    }
    const file = files.get(path);
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const bytes = await readFile(new URL(`./public/${file[0]}`, import.meta.url));
      res.writeHead(200, {'Content-Type': file[1]}); res.end(bytes);
    } catch { res.writeHead(500); res.end('Diagnostic file unavailable'); }
  });
  const wss = new WebSocketServer({noServer: true, maxPayload: 1024, perMessageDeflate: false});
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://probe.local').pathname !== '/ws' || wss.clients.size >= 100) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.on('error', () => {});
    ws.send(JSON.stringify({type: 'ready', instanceId, version: 1}));
    let count = 0;
    const expiry = setTimeout(() => ws.close(1000, 'probe_complete'), 120000);
    expiry.unref();
    ws.on('close', () => clearTimeout(expiry));
    ws.on('message', (data, binary) => {
      if (++count > 50) { ws.close(1008, 'message_limit'); return; }
      let message;
      try { if (binary) throw Error(); message = JSON.parse(data.toString()); } catch { ws.close(1008, 'invalid_message'); return; }
      if (!message || Object.keys(message).sort().join(',') !== 'id,type' || message.type !== 'ping' || !Number.isSafeInteger(message.id) || message.id < 0) {
        ws.close(1008, 'invalid_message'); return;
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type: 'pong', id: message.id}));
    });
  });
  return {server, wss, async close() {
    for (const ws of wss.clients) ws.close(1001, 'server_shutdown');
    const force = setTimeout(() => { for (const ws of wss.clients) ws.terminate(); server.closeAllConnections(); }, 1000);
    force.unref();
    await new Promise(resolve => server.close(resolve));
    wss.close(); clearTimeout(force);
  }};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const probe = createProbe();
  probe.server.listen(port, '0.0.0.0', () => console.log(`Connectivity probe listening on port ${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { probe.close().then(() => process.exit(0)); });
}
