// Owner-private eazy trading API. Bind D1 as DB and R2 as BUCKET.
// Schema is migration-owned: requests never create or alter tables.
const MAX_WORKSPACE_BYTES = 5 * 1024 * 1024;
const MAX_DATASET_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message); this.status = status; this.code = code; this.extra = extra;
  }
}
function fail(status, code, message, extra) { throw new ApiError(status, code, message, extra); }
function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
function identity(request) {
  const userId = request.headers.get('oai-authenticated-user-id');
  if (!userId || userId.length > 1024) fail(401, 'SIGN_IN_REQUIRED', 'Войдите в ChatGPT, чтобы открыть личное рабочее пространство.');
  return userId;
}
function writeOrigin(request) {
  const origin = request.headers.get('origin');
  // A browser cannot forge Origin. No permissive cross-origin write endpoint is exposed.
  if (origin !== new URL(request.url).origin) fail(403, 'SAME_ORIGIN_REQUIRED', 'Сохранение разрешено только с этого сайта.');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') fail(403, 'SAME_ORIGIN_REQUIRED', 'Сохранение разрешено только с этого сайта.');
}
function bindings(env, needBucket = true) {
  if (!env?.DB?.prepare) fail(503, 'DATABASE_UNAVAILABLE', 'Облачное хранилище ещё не подключено. Проверьте привязку D1 DB в настройках сайта.');
  if (needBucket && (!env?.BUCKET?.get || !env?.BUCKET?.put)) fail(503, 'FILE_STORAGE_UNAVAILABLE', 'Хранилище файлов ещё не подключено. Проверьте привязку R2 BUCKET в настройках сайта.');
}
async function bytes(request, limit) {
  const size = request.headers.get('content-length');
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > limit)) fail(413, 'BODY_TOO_LARGE', 'Файл или рабочее пространство превышает допустимый размер.');
  if (!request.body) fail(400, 'EMPTY_BODY', 'Тело запроса отсутствует.');
  const reader = request.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); fail(413, 'BODY_TOO_LARGE', 'Файл или рабочее пространство превышает допустимый размер.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!total) fail(400, 'EMPTY_BODY', 'Тело запроса отсутствует.');
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function bodyJSON(request, limit) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) fail(415, 'JSON_REQUIRED', 'Отправьте JSON с Content-Type application/json.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(request, limit))); }
  catch (error) { if (error instanceof ApiError) throw error; fail(400, 'INVALID_JSON', 'Не удалось прочитать JSON.'); }
}
async function digest(value) {
  const input = typeof value === 'string' ? encoder.encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function namespace(userId) { return 'users/' + await digest(userId); }
function sameJSON(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (a === b) continue;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
}
async function sameSavedWorkspace(row, payload, env) {
  if (!row) return false;
  const stored = await env.BUCKET.get(row.object_key);
  return stored ? sameJSON(payload, await stored.json()) : false;
}
function savedWorkspaceReply(row) {
  return json({ ok: true, version: 1, revision: row.revision, updatedAt: row.updated_at, unchanged: true });
}
function workspaceValidation(value) {
  if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0) fail(400, 'INVALID_WORKSPACE', 'Неверная версия или ревизия рабочего пространства.');
  if (!Array.isArray(value.sessions) || value.sessions.length > 1000 || !Array.isArray(value.playbooks) || value.playbooks.length > 500 || !object(value.settings)) fail(400, 'INVALID_WORKSPACE', 'Неверные сессии, модели или настройки рабочего пространства.');
  for (const [name, entries] of [['sessions', value.sessions], ['playbooks', value.playbooks]]) {
    const seen = new Set();
    for (const entry of entries) {
      if (!object(entry) || !validId(entry.id) || seen.has(entry.id)) fail(400, 'INVALID_WORKSPACE', 'У каждой записи ' + name + ' должен быть уникальный корректный id.');
      seen.add(entry.id);
      if (entry.datasetId !== undefined && entry.datasetId !== null && !validId(entry.datasetId)) fail(400, 'INVALID_WORKSPACE', 'Неверная ссылка на исторические данные.');
      if (entry.comparisonDatasetId !== undefined && (!validId(entry.comparisonDatasetId) || entry.comparisonDatasetId === entry.datasetId)) fail(400, 'INVALID_WORKSPACE', 'Неверная ссылка на данные второго инструмента.');
    }
  }
  return { version: 1, sessions: value.sessions, playbooks: value.playbooks, settings: value.settings };
}
async function workspaceGet(userId, env) {
  const row = await env.DB.prepare('SELECT revision, object_key FROM replay_workspaces WHERE user_id = ?').bind(userId).first();
  if (!row) return json({ version: 1, sessions: [], playbooks: [], settings: {}, revision: 0 });
  const stored = await env.BUCKET.get(row.object_key);
  if (!stored) fail(503, 'WORKSPACE_SNAPSHOT_MISSING', 'Сохранённая копия временно недоступна. Повторите загрузку позже.');
  const payload = await stored.json();
  return json({ ...payload, revision: row.revision });
}
async function workspacePut(request, userId, env) {
  const input = await bodyJSON(request, MAX_WORKSPACE_BYTES);
  const payload = workspaceValidation(input);
  const previous = await env.DB.prepare('SELECT revision, object_key, updated_at FROM replay_workspaces WHERE user_id = ?').bind(userId).first();
  const actual = previous?.revision ?? 0;
  if (actual !== input.revision) {
    // A pagehide save may succeed while its response is lost. Identical retries
    // are successful without increasing revision or overwriting a newer draft.
    if (await sameSavedWorkspace(previous, payload, env)) return savedWorkspaceReply(previous);
    fail(409, 'REVISION_CONFLICT', 'Рабочее пространство изменилось в другой вкладке или на другом устройстве. Загрузите свежую версию перед сохранением.', { revision: actual });
  }
  const nextRevision = actual + 1;
  const key = (await namespace(userId)) + '/workspace/' + nextRevision + '-' + crypto.randomUUID() + '.json';
  const serialized = JSON.stringify(payload);
  if (encoder.encode(serialized).byteLength > MAX_WORKSPACE_BYTES) fail(413, 'BODY_TOO_LARGE', 'Рабочее пространство превышает допустимый размер.');
  await env.BUCKET.put(key, serialized, { httpMetadata: { contentType: 'application/json' } });
  const now = Date.now();
  let result;
  try {
    if (previous) result = await env.DB.prepare('UPDATE replay_workspaces SET revision = ?, object_key = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(nextRevision, key, now, userId, actual).run();
    else result = await env.DB.prepare('INSERT INTO replay_workspaces (user_id, revision, object_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING').bind(userId, nextRevision, key, now, now).run();
  } catch (error) {
    // Do not remove the snapshot after an uncertain D1 outcome: it might be referenced.
    throw error;
  }
  if (Number(result?.meta?.changes) !== 1) {
    try { await env.BUCKET.delete(key); } catch { console.error('eazy trading API orphan cleanup deferred.'); }
    const fresh = await env.DB.prepare('SELECT revision, object_key, updated_at FROM replay_workspaces WHERE user_id = ?').bind(userId).first();
    if (await sameSavedWorkspace(fresh, payload, env)) return savedWorkspaceReply(fresh);
    fail(409, 'REVISION_CONFLICT', 'Рабочее пространство изменилось во время сохранения. Загрузите свежую версию.', { revision: fresh?.revision ?? 0 });
  }
  // Previous immutable copies remain available for a concurrent reader. No bulk deletion.
  return json({ ok: true, version: 1, revision: nextRevision, updatedAt: now });
}
function textField(value, max, name, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'INVALID_DATASET', 'Неверное поле данных: ' + name + '.');
  return value;
}
function validateDataset(input) {
  if (!object(input) || !validId(input.id) || !['NQ', 'ES'].includes(input.symbol)) fail(400, 'INVALID_DATASET', 'Укажите корректный id и инструмент NQ или ES.');
  const name = textField(input.name, 180, 'name');
  const source = textField(input.source, 600, 'source');
  if (input.metadata !== undefined && !object(input.metadata)) fail(400, 'INVALID_DATASET', 'Метаданные должны быть объектом.');
  if (!Array.isArray(input.bars) || !input.bars.length || input.bars.length > 150000) fail(400, 'INVALID_DATASET', 'Нужно от 1 до 150 000 минутных свечей.');
  let previous = -1;
  for (let i = 0; i < input.bars.length; i++) {
    const bar = input.bars[i];
    if (!object(bar) || !Number.isSafeInteger(bar.time) || bar.time < 0 || bar.time % 60 !== 0 || bar.time <= previous || bar.time > 4102444800) fail(400, 'INVALID_BARS', 'Время свечей должно возрастать и соответствовать началу минуты.', { bar: i });
    for (const field of ['open', 'high', 'low', 'close']) {
      const price = bar[field];
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 100000000 || Math.abs(price * 4 - Math.round(price * 4)) > 0.0000001) fail(400, 'INVALID_BARS', 'Цены NQ/ES должны быть положительными с шагом 0.25.', { bar: i, field });
    }
    if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.low > bar.high) fail(400, 'INVALID_BARS', 'Нарушена структура OHLC свечи.', { bar: i });
    if (typeof bar.volume !== 'number' || !Number.isFinite(bar.volume) || bar.volume < 0) fail(400, 'INVALID_BARS', 'Объём должен быть неотрицательным числом.', { bar: i });
    if (bar.contract !== undefined && (typeof bar.contract !== 'string' || !/^[A-Z0-9!._:-]{1,32}$/.test(bar.contract))) fail(400, 'INVALID_BARS', 'Неверный код фьючерсного контракта.', { bar: i });
    // Store a canonical candle, excluding arbitrary large unrecognized fields.
    input.bars[i] = { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, ...(bar.contract ? { contract: bar.contract } : {}) };
    previous = bar.time;
  }
  return { id: input.id, symbol: input.symbol, name, source, metadata: input.metadata || {}, bars: input.bars };
}
async function datasetPost(request, userId, env) {
  const dataset = validateDataset(await bodyJSON(request, MAX_DATASET_BYTES));
  const serialized = JSON.stringify(dataset); const content = encoder.encode(serialized);
  if (content.byteLength > MAX_DATASET_BYTES) fail(413, 'BODY_TOO_LARGE', 'Набор данных превышает допустимый размер.');
  const sha = await digest(content);
  const existing = await env.DB.prepare('SELECT object_key, sha256 FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId, dataset.id).first();
  if (existing && existing.sha256 !== sha) fail(409, 'DATASET_ID_CONFLICT', 'Этот id уже принадлежит другому набору исторических данных. Создайте новый id.');
  if (existing) return json({ id: dataset.id, symbol: dataset.symbol, count: dataset.bars.length, sha256: sha, existing: true });
  const key = (await namespace(userId)) + '/datasets/' + dataset.id + '/' + sha + '.json';
  await env.BUCKET.put(key, content, { httpMetadata: { contentType: 'application/json' }, customMetadata: {kind:'bars',firstTime:String(dataset.bars[0].time),lastTime:String(dataset.bars.at(-1).time)} });
  await env.DB.prepare('INSERT INTO replay_datasets (user_id, id, object_key, sha256, symbol, name, bar_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO NOTHING').bind(userId, dataset.id, key, sha, dataset.symbol, dataset.name, dataset.bars.length, Date.now()).run();
  const saved = await env.DB.prepare('SELECT object_key, sha256 FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId, dataset.id).first();
  if (saved?.sha256 !== sha) {
    if (saved && saved.object_key !== key) await env.BUCKET.delete(key);
    fail(409, 'DATASET_ID_CONFLICT', 'Этот id уже был сохранён другой вкладкой с другими данными.');
  }
  return json({ id: dataset.id, symbol: dataset.symbol, count: dataset.bars.length, sha256: sha }, 201);
}
async function archivePost(request,userId,env){
  const input=await bodyJSON(request,128*1024);
  if(!object(input)||!validId(input.id)||!['NQ','ES'].includes(input.symbol)||!Array.isArray(input.parts)||!input.parts.length||input.parts.length>72)fail(400,'INVALID_ARCHIVE','Нужен архив NQ/ES из 1–72 частей.');
  const name=textField(input.name,180,'name'),parts=[],seen=new Set();let previous=0,count=0;
  for(const ref of input.parts){
    if(!object(ref)||!validId(ref.id)||seen.has(ref.id))fail(400,'INVALID_ARCHIVE','Повторяющаяся или неверная часть архива.');seen.add(ref.id);
    const row=await env.DB.prepare('SELECT object_key, symbol, bar_count FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId,ref.id).first();
    if(!row||row.symbol!==input.symbol)fail(400,'INVALID_ARCHIVE','Часть архива недоступна или относится к другому инструменту.');
    let stored=env.BUCKET.head?await env.BUCKET.head(row.object_key):await env.BUCKET.get(row.object_key);if(!stored)fail(503,'DATASET_FILE_MISSING','Часть архива временно недоступна.');
    let firstTime,lastTime;const meta=stored.customMetadata;
    if(meta?.kind==='archive')fail(400,'INVALID_ARCHIVE','Вложенные архивы не поддерживаются.');
    if(meta?.kind==='bars'){firstTime=Number(meta.firstTime);lastTime=Number(meta.lastTime);}
    else{stored=await env.BUCKET.get(row.object_key);const data=await stored.json();if(!Array.isArray(data.bars)||data.bars.length!==row.bar_count)fail(400,'INVALID_ARCHIVE','Неверная часть архива.');firstTime=data.bars[0].time;lastTime=data.bars.at(-1).time;}
    if(!Number.isSafeInteger(firstTime)||!Number.isSafeInteger(lastTime)||firstTime<=previous||lastTime<firstTime)fail(400,'INVALID_ARCHIVE','Части должны идти по времени без пересечения.');
    const monthAt=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).format(new Date(t*1000));const month=monthAt(firstTime);if(month!==monthAt(lastTime))fail(400,'INVALID_ARCHIVE','Части архива должны быть разбиты по месяцам Нью-Йорка.');previous=lastTime;count+=row.bar_count;if(count>3000000)fail(400,'INVALID_ARCHIVE','Максимум 3 000 000 свечей в архиве.');parts.push({id:ref.id,count:row.bar_count,firstTime,lastTime,month});
  }
  const dataset={id:input.id,kind:'archive',symbol:input.symbol,name,source:'user_csv',count,firstTime:parts[0].firstTime,lastTime:parts.at(-1).lastTime,parts,months:[...new Set(parts.map(p=>p.month))],metadata:{importedAt:new Date().toISOString(),contractColumn:!!input.hasContracts}};
  const content=encoder.encode(JSON.stringify(dataset)),sha=await digest(content);
  const existing=await env.DB.prepare('SELECT object_key, sha256 FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId,input.id).first();
  if(existing)fail(409,'DATASET_ID_CONFLICT','Архив с этим ID уже сохранён.');
  const key=(await namespace(userId))+'/archives/'+input.id+'/'+sha+'.json';
  await env.BUCKET.put(key,content,{httpMetadata:{contentType:'application/json'},customMetadata:{kind:'archive'}});
  await env.DB.prepare('INSERT INTO replay_datasets (user_id, id, object_key, sha256, symbol, name, bar_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO NOTHING').bind(userId,input.id,key,sha,input.symbol,name,count,Date.now()).run();
  const saved=await env.DB.prepare('SELECT object_key, sha256 FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId,input.id).first();
  if(saved?.sha256!==sha){if(saved&&saved.object_key!==key)await env.BUCKET.delete(key);fail(409,'DATASET_ID_CONFLICT','Этот архив сохранён другой вкладкой.');}
  return json(dataset,201);
}
async function datasetGet(id, userId, env) {
  if (!validId(id)) fail(404, 'NOT_FOUND', 'Данные не найдены.');
  const row = await env.DB.prepare('SELECT object_key FROM replay_datasets WHERE user_id = ? AND id = ?').bind(userId, id).first();
  if (!row) fail(404, 'NOT_FOUND', 'Данные не найдены.');
  const stored = await env.BUCKET.get(row.object_key);
  if (!stored) fail(503, 'DATASET_FILE_MISSING', 'Файл исторических данных временно недоступен.');
  return new Response(stored.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function imageType(data) {
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return 'image/png';
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg';
  if (data.length >= 12 && new TextDecoder().decode(data.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(data.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
function filename(request) {
  let name = request.headers.get('x-filename') || 'Screenshot';
  try { name = decodeURIComponent(name); } catch {}
  return name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || 'Screenshot';
}
async function attachmentPost(request, userId, env) {
  const expected = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(expected)) fail(415, 'IMAGE_REQUIRED', 'Поддерживаются PNG, JPEG и WebP до 5 МБ.');
  const content = await bytes(request, MAX_ATTACHMENT_BYTES);
  if (imageType(content) !== expected) fail(400, 'INVALID_IMAGE', 'Содержимое файла не соответствует формату изображения.');
  const id = crypto.randomUUID(); const name = filename(request);
  const key = (await namespace(userId)) + '/attachments/' + id;
  await env.BUCKET.put(key, content, { httpMetadata: { contentType: expected }, customMetadata: { name } });
  return json({ id, url: '/api/attachments/' + id, name }, 201);
}
async function attachmentGet(id, userId, env) {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) fail(404, 'NOT_FOUND', 'Изображение не найдено.');
  const stored = await env.BUCKET.get((await namespace(userId)) + '/attachments/' + id);
  if (!stored) fail(404, 'NOT_FOUND', 'Изображение не найдено.');
  return new Response(stored.body, { headers: { 'Content-Type': stored.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(stored.customMetadata?.name || 'Screenshot') } });
}

// These immutable public-source candles are shared within the owner-private Site,
// not user workspaces. Sites dispatch enforces that audience for service callers.
// A write can only store bytes whose SHA matches a part in the published catalog.
// No caller can choose an object key, mutate a manifest, or overwrite user data.
async function curatedMarketData(request,env,part){
  if(!part||!validId(part.id))fail(404,'NOT_FOUND','Рыночная часть архива не найдена.');
  if(!env?.BUCKET?.get||!env?.BUCKET?.put)fail(503,'FILE_STORAGE_UNAVAILABLE','Хранилище рыночных архивов временно недоступно.');
  const key='curated-market-data/'+part.id+'/'+part.sha256+'.b64';
  if(request.method==='GET'){
    const version=new URL(request.url).searchParams.get('v');
    if(version&&version!==part.sha256)fail(404,'NOT_FOUND','Версия архива не найдена.');
    const stored=await env.BUCKET.get(key);if(!stored)fail(503,'MARKET_DATA_NOT_READY','Эта часть рыночного архива ещё загружается. Повторите попытку позже.');
    return new Response(stored.body,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'private, max-age=86400, immutable','ETag':'"'+part.sha256+'"','X-Content-Type-Options':'nosniff'}});
  }
  if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','Используйте GET или POST.');
  writeOrigin(request);
  if(!/^text\/plain(?:;|$)/i.test(request.headers.get('content-type')||''))fail(415,'TEXT_REQUIRED','Нужен упакованный текст архива.');
  const size=Math.ceil(part.packedBytes/3)*4;
  if(size>8*1024*1024)fail(413,'BODY_TOO_LARGE','Часть архива слишком велика.');
  const body=await bytes(request,size);if(body.length!==size)fail(400,'MARKET_DATA_SIZE_MISMATCH','Размер архива не совпадает с индексом.');
  let packed;
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(body);if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error();packed=Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
  catch{fail(400,'INVALID_MARKET_DATA','Некорректный упакованный архив.');}
  if(packed.length!==part.packedBytes||await digest(packed)!==part.sha256)fail(400,'MARKET_DATA_CHECKSUM_MISMATCH','Контрольная сумма архива не совпадает с индексом.');
  const existing=env.BUCKET.head?await env.BUCKET.head(key):await env.BUCKET.get(key);
  if(!existing)await env.BUCKET.put(key,body,{httpMetadata:{contentType:'text/plain; charset=utf-8'},customMetadata:{sha256:part.sha256,count:String(part.count)}});
  return json({ok:true,id:part.id,sha256:part.sha256,count:part.count,existing:!!existing},existing?200:201);
}

export async function api(request, env,curatedParts={}) {
  try {
    const pathname=new URL(request.url).pathname;
    if(pathname.startsWith('/api/market-data/'))return await curatedMarketData(request,env,curatedParts[pathname.slice('/api/market-data/'.length)]);
    const userId = identity(request);
    if (!['GET', 'PUT', 'POST'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', 'Метод не поддерживается.');
    if (request.method !== 'GET') writeOrigin(request);
    bindings(env);
    if (pathname === '/api/workspace') {
      if (request.method === 'GET') return await workspaceGet(userId, env);
      if (request.method === 'PUT') return await workspacePut(request, userId, env);
      fail(405, 'METHOD_NOT_ALLOWED', 'Используйте GET или PUT.');
    }
    if (pathname === '/api/datasets' && request.method === 'POST') return await datasetPost(request, userId, env);
    if (pathname === '/api/archives' && request.method === 'POST') return await archivePost(request, userId, env);
    if (pathname.startsWith('/api/datasets/') && request.method === 'GET') return await datasetGet(pathname.slice('/api/datasets/'.length), userId, env);
    if (pathname === '/api/attachments' && request.method === 'POST') return await attachmentPost(request, userId, env);
    if (pathname.startsWith('/api/attachments/') && request.method === 'GET') return await attachmentGet(pathname.slice('/api/attachments/'.length), userId, env);
    fail(404, 'NOT_FOUND', 'API не найдено.');
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.code, message: error.message, ...error.extra }, error.status);
    // Do not return binding errors, SQL, object keys, identity, or private payloads.
    console.error('eazy trading API storage operation failed:', error?.name || 'Error');
    return json({ error: 'STORAGE_ERROR', message: 'Облачное сохранение временно недоступно. Ваши локальные данные сохранены; повторите попытку позже.' }, 503);
  }
}
