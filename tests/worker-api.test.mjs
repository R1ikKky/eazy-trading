import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { api } from '../worker/api.mjs';

class FakeD1 {
  constructor(schema) { this.database = new DatabaseSync(':memory:'); this.database.exec(schema); this.operations = 0; }
  prepare(sql) {
    this.operations++;
    const statement = this.database.prepare(sql);
    return { bind: (...args) => ({
      first: async () => statement.get(...args) || null,
      run: async () => ({ success: true, meta: { changes: Number(statement.run(...args).changes) } }),
    }) };
  }
}
class FakeR2 {
  constructor() { this.files = new Map(); }
  async put(key, value, options = {}) {
    const content = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.files.set(key, { content, ...options });
  }
  async get(key) {
    const entry = this.files.get(key); if (!entry) return null;
    return { body: new Response(entry.content).body, httpMetadata: entry.httpMetadata, customMetadata: entry.customMetadata,
      json: async () => JSON.parse(new TextDecoder().decode(entry.content)),
    };
  }
  async delete(key) { this.files.delete(key); }
}
const schema = await readFile(new URL('../drizzle/0000_replay_workspace.sql', import.meta.url), 'utf8');
const env = { DB: new FakeD1(schema), BUCKET: new FakeR2() };
const origin = 'https://replay.example';
function request(path, method = 'GET', value, user = 'alice', extra = {}) {
  const headers = { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(method !== 'GET' ? { origin } : {}), ...extra };
  const options = { method, headers };
  if (value !== undefined) {
    if (value instanceof Uint8Array) options.body = value;
    else { options.body = JSON.stringify(value); options.headers['Content-Type'] = 'application/json'; }
  }
  return new Request(origin + path, options);
}
async function call(path, method = 'GET', value, user = 'alice', extra = {}) {
  const response = await api(request(path, method, value, user, extra), env);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return { status: response.status, payload: await response.json(), response };
}
const blank = revision => ({ version: 1, sessions: [], playbooks: [], settings: {}, revision });

assert.equal((await call('/api/workspace', 'GET', undefined, null)).status, 401);
assert.equal(env.DB.operations, 0, 'Unauthenticated calls must not touch private records.');
assert.equal((await call('/api/workspace', 'PUT', blank(0), 'alice', { origin: 'https://attacker.example' })).status, 403);
assert.equal((await call('/api/workspace', 'PUT', blank(0), 'alice', { 'sec-fetch-site': 'cross-site' })).status, 403);
assert.equal(env.DB.operations, 0, 'Cross-origin writes must not touch storage.');
assert.deepEqual((await call('/api/workspace')).payload, blank(0));
assert.equal((await api(request('/api/workspace'), {})).status, 503);
assert.equal((await api(request('/api/workspace'), { DB: env.DB })).status, 503);

const initial = { ...blank(0), sessions: [{ id: 's1', name: 'London', datasetId: 'NQ-Jan2024', comparisonDatasetId: 'ES-Jan2024', trades: [{ id: 'trade-1', net: 125.5 }] }], playbooks: [{ id: 'ict', name: 'ICT' }], settings: { timezone: 'America/New_York', theme: 'dark' } };
assert.equal((await call('/api/workspace', 'PUT', initial)).payload.revision, 1);
const loaded = (await call('/api/workspace')).payload;
assert.deepEqual(loaded, { ...initial, revision: 1 });
const identicalRetry = await call('/api/workspace', 'PUT', { ...initial, settings: { theme: 'dark', timezone: 'America/New_York' } });
assert.equal(identicalRetry.status, 200, 'A retry after a lost save response must be idempotent.');
assert.equal(identicalRetry.payload.revision, 1);
assert.equal(identicalRetry.payload.unchanged, true, 'Object property order must not create a false conflict.');
assert.deepEqual((await call('/api/workspace', 'GET', undefined, 'bob')).payload, blank(0), 'Other owner must not load Alice workspace.');
const stale = await call('/api/workspace', 'PUT', blank(0));
assert.equal(stale.status, 409); assert.equal(stale.payload.revision, 1);
assert.deepEqual((await call('/api/workspace')).payload, loaded, 'Stale saves must not overwrite newer data.');

const beforeRace = env.BUCKET.files.size;
const racing = await Promise.all([call('/api/workspace', 'PUT', { ...loaded, settings: { winner: 'A' } }), call('/api/workspace', 'PUT', { ...loaded, settings: { winner: 'B' } })]);
assert.deepEqual(racing.map(x => x.status).sort(), [200, 409], 'Only one revision-based concurrent save can succeed.');
assert.equal(env.BUCKET.files.size, beforeRace + 1, 'Failed compare-and-swap snapshot should be cleaned up.');
assert.equal((await call('/api/workspace')).payload.revision, 2);
const latest = (await call('/api/workspace')).payload;
const sameRace = await Promise.all([call('/api/workspace', 'PUT', { ...latest, settings: { same: 'value' } }), call('/api/workspace', 'PUT', { ...latest, settings: { same: 'value' } })]);
assert.deepEqual(sameRace.map(x => x.status), [200, 200], 'Identical concurrent autosaves should resolve to the same committed revision.');
assert.deepEqual(sameRace.map(x => x.payload.revision), [3, 3]);
assert.equal((await call('/api/workspace', 'PUT', { ...blank(0), sessions: [{ id: 'duplicate' }, { id: 'duplicate' }] }, 'bob')).status, 400);
assert.equal((await call('/api/workspace', 'PUT', { ...blank(0), sessions: Array.from({ length: 1001 }, (_, i) => ({ id: 's' + i })) }, 'bob')).status, 400);
assert.equal((await call('/api/workspace', 'PUT', { ...blank(0), settings: null }, 'bob')).status, 400);
for(const comparisonDatasetId of [null,'../private','same'])assert.equal((await call('/api/workspace','PUT',{...blank(0),sessions:[{id:'pair',datasetId:'same',comparisonDatasetId}]},'bob')).status,400);
assert.deepEqual((await call('/api/workspace','GET',undefined,'bob')).payload,blank(0),'Invalid paired links must not create or replace a workspace.');
assert.equal((await call('/api/workspace', 'PUT', blank(0), 'bob', { 'content-length': String(6 * 1024 * 1024) })).status, 413);
// Verify a workspace larger than D1's row limit: only its small pointer enters SQLite/D1.
const largeWorkspace = { ...blank(0), settings: { notes: 'x'.repeat(2_100_000) } };
assert.equal((await call('/api/workspace', 'PUT', largeWorkspace, 'large-user')).status, 200);
assert.equal((await call('/api/workspace', 'GET', undefined, 'large-user')).payload.settings.notes.length, 2_100_000);

const bar = { time: 1704205800, open: 16600, high: 16601, low: 16599.75, close: 16600.25, volume: 23, contract: 'NQH24' };
const dataset = { id: 'NQ-Jan2024', symbol: 'NQ', name: 'January 2024', source: 'Verified source', metadata: { timezone: 'UTC' }, bars: [bar, { ...bar, time: bar.time + 60 }] };
const savedDataset = await call('/api/datasets', 'POST', dataset);
assert.equal(savedDataset.status, 201); assert.equal(savedDataset.payload.count, 2);
assert.equal((await call('/api/datasets', 'POST', dataset)).payload.existing, true, 'Identical dataset upload should be idempotent.');
assert.deepEqual((await call('/api/datasets/' + dataset.id)).payload, dataset);
assert.equal((await call('/api/datasets/' + dataset.id, 'GET', undefined, 'bob')).status, 404);
assert.equal((await call('/api/datasets', 'POST', { ...dataset, bars: [{ ...bar, close: 16600.5 }] })).status, 409, 'Dataset identifiers are immutable.');
for (const changed of [
  { ...bar, time: bar.time + 1 }, { ...bar, open: 16600.1 }, { ...bar, high: 16599 },
  { ...bar, low: 16601 }, { ...bar, volume: -1 }, { ...bar, contract: '../secret' },
]) assert.equal((await call('/api/datasets', 'POST', { ...dataset, id: 'invalid', bars: [changed] })).status, 400);
assert.equal((await call('/api/datasets', 'POST', { ...dataset, id: 'invalid', bars: [bar, bar] })).status, 400);
assert.equal((await call('/api/datasets', 'POST', { ...dataset, id: 'invalid', bars: Array(150001).fill(bar) })).status, 400);
assert.equal((await call('/api/datasets', 'POST', { ...dataset, id: '../secret' })).status, 400);
assert.equal((await call('/api/datasets', 'POST', { ...dataset, id: 'wrong-symbol', symbol: 'XAUUSD' })).status, 400);
assert.equal((await call('/api/datasets', 'POST', dataset, 'alice', { 'content-length': String(21 * 1024 * 1024) })).status, 413);
const bobDataset = await call('/api/datasets', 'POST', dataset, 'bob');
assert.equal(bobDataset.status, 201, 'Different users may use the same immutable dataset ID.');

// Archive metadata comes from validated owned objects, never client bounds/counts.
const december={...dataset,id:'NQ-Dec2025',bars:[{...bar,time:1764685800},{...bar,time:1764685860}]};
assert.equal((await call('/api/datasets','POST',december)).status,201);
const archiveInput={id:'NQ-2024-2025',symbol:'NQ',name:'Long history',hasContracts:true,parts:[{id:dataset.id,count:999999,firstTime:1},{id:december.id}]};
const archiveSaved=await call('/api/archives','POST',archiveInput);assert.equal(archiveSaved.status,201);assert.equal(archiveSaved.payload.count,4);assert.equal(archiveSaved.payload.firstTime,bar.time);assert.deepEqual(archiveSaved.payload.months,['2024-01','2025-12']);
assert.equal((await call('/api/datasets/'+archiveInput.id)).payload.kind,'archive');assert.equal((await call('/api/datasets/'+archiveInput.id,'GET',undefined,'bob')).status,404);
for(const parts of [[{id:december.id},{id:dataset.id}],[{id:dataset.id},{id:dataset.id}],[{id:archiveInput.id}],[{id:'missing'}]])assert.equal((await call('/api/archives','POST',{...archiveInput,id:crypto.randomUUID(),parts})).status,400);
assert.equal((await call('/api/archives','POST',{...archiveInput,id:'wrong-ES',symbol:'ES'})).status,400);
assert.equal((await call('/api/archives','POST',{...archiveInput,id:'bob-archive'},'bob')).status,400);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const attachment = await call('/api/attachments', 'POST', png, 'alice', { 'content-type': 'image/png', 'x-filename': encodeURIComponent('Вход NQ.png') });
assert.equal(attachment.status, 201); assert.equal(attachment.payload.name, 'Вход NQ.png');
const image = await api(request(attachment.payload.url), env);
assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png);
assert.equal((await api(request(attachment.payload.url, 'GET', undefined, 'bob'), env)).status, 404);
assert.equal((await call('/api/attachments', 'POST', new Uint8Array([60, 104, 116, 109, 108]), 'alice', { 'content-type': 'image/png' })).status, 400);
assert.equal((await call('/api/attachments', 'POST', png, 'alice', { 'content-type': 'image/svg+xml' })).status, 415);
assert.equal((await call('/api/attachments', 'POST', png, 'alice', { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) })).status, 413);

// Enforce streaming limits even when the caller omits Content-Length.
const oversized = new Request(origin + '/api/attachments', { method: 'POST', headers: { 'oai-authenticated-user-id': 'alice', origin, 'content-type': 'image/png' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); controller.close(); } }), duplex: 'half' });
assert.equal((await api(oversized, env)).status, 413);
assert.equal((await call('/api/not-real')).status, 404);
assert.equal((await api(request('/api/workspace', 'DELETE'), env)).status, 405);
console.log('API integration passed: real SQLite migration, identity, ownership, origin, revision CAS races, large workspaces, immutable datasets, candle validation, private attachments and streamed size limits.');
