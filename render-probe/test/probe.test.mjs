import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createProbe} from '../server.mjs';

async function running(t) {
  const probe = createProbe(); probe.server.listen(0, '127.0.0.1'); await once(probe.server, 'listening');
  t.after(() => probe.close());
  return {probe, base: `http://127.0.0.1:${probe.server.address().port}`};
}
test('HTTP health, explicit CORS, static diagnostic files and no game API', async t => {
  const {base} = await running(t);
  const r = await fetch(base + '/health', {headers: {Origin: 'https://averanges.github.io'}});
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const body = await r.json(); assert.equal(body.ok, true); assert.equal(body.service, 'hangul-durak-render-probe');
  for (const path of ['/', '/diagnostics.html', '/diagnostics.js']) assert.equal((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + '/health', {method: 'OPTIONS'})).status, 204);
  assert.equal((await fetch(base + '/api/rooms')).status, 404);
  assert.equal((await fetch(base + '/health', {method: 'POST'})).status, 405);
});
test('WebSocket ready, measured ping/pong and fresh connection use same process', {timeout: 5000}, async t => {
  const {base} = await running(t);
  const health = await (await fetch(base + '/health')).json();
  for (let i = 0; i < 2; i++) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws'); t.after(() => ws.terminate());
    const [ready] = await once(ws, 'message'); assert.equal(JSON.parse(ready).instanceId, health.instanceId);
    const reply = once(ws, 'message'); ws.send(JSON.stringify({type: 'ping', id: i}));
    assert.deepEqual(JSON.parse((await reply)[0]), {type: 'pong', id: i}); ws.close(); await once(ws, 'close');
  }
});
test('WebSocket rejects unrelated paths and invalid data', {timeout: 5000}, async t => {
  const {base} = await running(t);
  const wrong = new WebSocket(base.replace('http:', 'ws:') + '/api/rooms'); wrong.on('error', () => {});
  const [, response] = await once(wrong, 'unexpected-response'); assert.equal(response.statusCode, 404); wrong.terminate();
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws'); t.after(() => ws.terminate());
  await once(ws, 'message'); const closed = once(ws, 'close'); ws.send('{"secret":"not-a-real-secret"}');
  assert.equal((await closed)[0], 1008);
});
test('restart changes instance identifier and stores no rooms', async t => {
  const a = await running(t), b = await running(t);
  const first = await (await fetch(a.base + '/health')).json(), second = await (await fetch(b.base + '/health')).json();
  assert.notEqual(first.instanceId, second.instanceId);
});
