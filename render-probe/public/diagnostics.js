/* No React, external libraries, cookies, storage or game connections. */
const $ = id => document.getElementById(id);
const deadlineMs = 90000;
let latest;
if (/^https?:$/.test(location.protocol)) $('base').value = location.origin;
const ms = start => Math.round(performance.now() - start);
function log(message) { $('log').textContent += message + '\n'; }
function httpError(error, timedOut) {
  return timedOut ? 'Тайм-аут 90 секунд. Возможны холодный старт или недоступность сети.' : error.message === 'unexpected_response' ? 'Получен ответ, не похожий на наш /health (возможна страница запуска или прокси).' : 'Запрос не выполнен. Браузер не различает здесь DNS, TLS, CORS и ограничения сети. Проверьте другую сеть и VPN.';
}
async function http(base) {
  const start = performance.now(), controller = new AbortController(); let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deadlineMs);
  const result = {};
  try {
    const response = await fetch(base + '/health', {signal: controller.signal, cache: 'no-store', credentials: 'omit'});
    result.status = response.status;
    const bytes = await response.arrayBuffer(); result.bytes = bytes.byteLength;
    if (!response.ok) { result.error = `HTTP ${response.status}`; result.ok = false; }
    else {
      let value; try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw Error('unexpected_response'); }
      if (value.ok !== true || value.service !== 'hangul-durak-render-probe' || typeof value.instanceId !== 'string') throw Error('unexpected_response');
      result.ok = true; result.instanceId = value.instanceId; result.uptimeSeconds = value.uptimeSeconds;
    }
  } catch (error) { result.ok = false; result.error = httpError(error, timedOut); }
  finally { clearTimeout(timer); result.elapsedMs = ms(start); }
  return result;
}
function websocket(base) {
  return new Promise(resolve => {
    const start = performance.now(), result = {ok: false, rttMs: []};
    let ws, done = false, connectTimer, interval, pongTimer, startedPings, sentAt, id = 0;
    const finish = error => {
      if (done) return; done = true;
      clearTimeout(connectTimer); clearTimeout(pongTimer); clearInterval(interval);
      result.totalMs = ms(start); if (error) result.error = error;
      if (ws && ws.readyState < WebSocket.CLOSING) ws.close(1000, 'diagnostic_done');
      resolve(result);
    };
    try { const url = new URL('/ws', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; ws = new WebSocket(url); }
    catch { finish('Не удалось создать WebSocket. Проверьте адрес и поддержку браузера.'); return; }
    connectTimer = setTimeout(() => finish('Тайм-аут открытия WebSocket/ready: 90 секунд. Возможны холодный старт или блокировка соединения.'), deadlineMs);
    ws.onopen = () => { result.connectMs = ms(start); log(`WebSocket открыт за ${result.connectMs} мс. Ожидаем тестовые ответы…`); };
    function ping() {
      if (done) return;
      sentAt = performance.now(); ws.send(JSON.stringify({type: 'ping', id: ++id}));
      pongTimer = setTimeout(() => finish('WebSocket открыт, но ответ pong не получен за 8 секунд.'), 8000);
    }
    ws.onmessage = event => {
      let value; try { value = JSON.parse(event.data); } catch { finish('Неожиданный формат ответа WebSocket.'); return; }
      if (value.type === 'ready' && !startedPings && value.version === 1 && typeof value.instanceId === 'string') {
        result.instanceId = value.instanceId; result.readyMs = ms(start); clearTimeout(connectTimer); startedPings = performance.now();
        ping(); interval = setInterval(ping, 10000);
      } else if (value.type === 'pong' && value.id === id && startedPings) {
        clearTimeout(pongTimer); const rtt = ms(sentAt); result.rttMs.push(rtt); log(`Ответ ${id}: ${rtt} мс`);
        if (result.rttMs.length === 4) { result.ok = true; result.observedMs = ms(startedPings); finish(); }
      } else finish('Неожиданный ответ тестового WebSocket.');
    };
    ws.onerror = () => finish('WebSocket не подключился. Браузер не раскрывает точную причину: возможны TLS, прокси или ограничения сети.');
    ws.onclose = event => finish(`WebSocket закрыт до окончания проверки (код ${event.code}). Возможны перезапуск сервера или потеря сети.`);
  });
}
$('run').onclick = async () => {
  let base;
  try {
    const url = new URL($('base').value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
    if (location.protocol === 'https:' && url.protocol !== 'https:') throw Error();
    base = url.origin;
  } catch { $('log').textContent = 'Введите только адрес сервера, например https://имя.onrender.com, без пути, пароля и параметров. На HTTPS-странице нужен HTTPS-сервер.'; return; }
  $('run').disabled = true; $('download').disabled = true; $('report').value = ''; $('log').textContent = '';
  latest = {checkedAt: new Date().toISOString(), server: base, region: $('region').value, network: $('network').value, pageMode: location.protocol === 'file:' ? 'local-file' : 'web', timeoutMs: deadlineMs};
  try {
    log('Проверяем HTTP /health…'); latest.http = await http(base);
    log(latest.http.ok ? `HTTP ${latest.http.status}: ${latest.http.elapsedMs} мс, ${latest.http.bytes} байт.` : `HTTP: ${latest.http.error}`);
    log('Проверяем WebSocket /ws независимо от результата HTTP…'); latest.websocket = await websocket(base);
    log(latest.websocket.ok ? 'WebSocket: 4 ответа получены, связь проверена в течение 30 секунд.' : latest.websocket.error);
    if (latest.http.instanceId && latest.websocket.instanceId && latest.http.instanceId !== latest.websocket.instanceId) log('Между проверками сменился процесс сервера. Повторите тест.');
  } finally {
    $('report').value = JSON.stringify(latest, null, 2); $('run').disabled = false; $('download').disabled = false;
  }
};
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(latest, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'render-connectivity.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
