// Production guard: exercise the actual browser storage/sync module without a browser.
import assert from 'node:assert/strict';
import { WorkspaceStore, blankWorkspace, escapeHTML } from '../frontend/src/replay/workspace-store.ts';

const CACHE = 'eazy-trading-workspace-v1:test-owner';
const savedSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
let currentUser = 'test-owner';
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => currentUser } });
const savedGlobals = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
const cache = new Map(); const timers = new Map(); const responses = []; const calls = [];
let timerId = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, String(value)), removeItem: key => cache.delete(key) } });
globalThis.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.fetch = async (url, options = {}) => {
  const call = { url, method: options.method || 'GET', options, payload: options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body };
  calls.push(call);
  assert.ok(responses.length, 'Unexpected network request: ' + call.method + ' ' + url);
  const response = responses.shift();
  if (typeof response === 'function') return response(call);
  if (response instanceof Error) throw response;
  return response;
};
const answer = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const workspace = (revision = 0, theme = 'dark') => ({ ...blankWorkspace(), revision, settings: { theme } });
function fresh() { cache.clear(); timers.clear(); responses.length = 0; calls.length = 0; const status = []; return { store: new WorkspaceStore((...args) => status.push(args)), status }; }
function cacheDraft(value, dirty) { cache.set(CACHE, JSON.stringify({ value, dirty })); }
function savedCache() { const {value,dirty} = JSON.parse(cache.get(CACHE)); return {value,dirty}; }

try {
  // An offline draft belonging to another account is never restored.
  {
    const { store } = fresh(); cacheDraft(workspace(9, 'private-owner-theme'), true);
    currentUser = 'different-owner'; responses.push(new TypeError('Offline'));
    assert.deepEqual(await store.load(), blankWorkspace());
    assert.equal(JSON.parse(cache.get(CACHE)).value.settings.theme, 'private-owner-theme');
    currentUser = 'test-owner';
  }
  // Successful initial cloud load persists the authoritative workspace on this device.
  {
    const { store, status } = fresh(); responses.push(answer(workspace(4)));
    assert.deepEqual(await store.load(), workspace(4)); assert.equal(store.ready, true); assert.equal(store.dirty, false);
    assert.deepEqual(savedCache(), { value: workspace(4), dirty: false }); assert.equal(status.at(-1)[0], 'saved');
    assert.equal(calls[0].options.cache, 'no-store'); assert.equal(timers.size, 0);
  }
  // A clean old cache updates from cloud; an offline dirty cache keeps every local edit.
  {
    const { store } = fresh(); cacheDraft(workspace(1, 'light'), false); responses.push(answer(workspace(5)));
    assert.deepEqual(await store.load(), workspace(5));
  }
  {
    const { store, status } = fresh(); cacheDraft(workspace(5, 'light'), true); responses.push(new TypeError('Network unavailable'));
    assert.deepEqual(await store.load(), workspace(5, 'light')); assert.equal(store.dirty, true); assert.equal(store.conflict, false);
    assert.equal(status.at(-1)[0], 'offline'); assert.deepEqual(savedCache(), { value: workspace(5, 'light'), dirty: true });
    assert.equal(timers.size, 1, 'Offline edits remain queued for a later cloud save.');
  }
  // Dirty local changes at the current cloud revision survive loading and then save.
  {
    const { store } = fresh(); cacheDraft(workspace(5, 'light'), true); responses.push(answer(workspace(5, 'dark')));
    assert.deepEqual(await store.load(), workspace(5, 'light')); assert.equal(store.conflict, false);
    responses.push(answer({ ok: true, revision: 6 })); assert.equal(await store.flush(), true);
    assert.equal(calls.at(-1).payload.settings.theme, 'light'); assert.equal(calls.at(-1).payload.revision, 5);
    assert.equal(store.value.revision, 6); assert.equal(store.dirty, false); assert.equal(savedCache().dirty, false);
  }
  // Editing while a save is in flight must not mark those later edits as saved.
  {
    const { store, status } = fresh(); responses.push(answer(workspace(5, 'light'))); await store.load(); store.changed();
    let resolveSave;
    responses.push(() => new Promise(resolve => { resolveSave = resolve; }));
    const first = store.flush(); assert.equal(store.saving, true);
    assert.equal(calls.at(-1).payload.settings.theme, 'light');
    store.value.settings.theme = 'dark'; store.changed();
    assert.equal(calls.at(-1).payload.settings.theme, 'light', 'In-flight request uses a snapshot of its generation.');
    resolveSave(answer({ ok: true, revision: 6 })); assert.equal(await first, true);
    assert.equal(store.value.settings.theme, 'dark'); assert.equal(store.value.revision, 6); assert.equal(store.dirty, true);
    assert.equal(status.at(-1)[0], 'pending'); assert.equal(savedCache().dirty, true); assert.equal(timers.size, 1);
    responses.push(answer({ ok: true, revision: 7 })); assert.equal(await store.flush(), true);
    assert.equal(calls.at(-1).payload.settings.theme, 'dark'); assert.equal(calls.at(-1).payload.revision, 6);
    assert.equal(store.value.revision, 7); assert.equal(store.dirty, false); assert.equal(status.at(-1)[0], 'saved');
  }
  // A 409 queues an automatic rebase without dropping pending edits.
  {
    const { store, status } = fresh(); responses.push(answer(workspace(7))); await store.load(); store.value.settings.theme = 'light'; store.changed();
    responses.push(answer({ error: 'REVISION_CONFLICT', revision: 8 }, 409)); assert.equal(await store.flush(), false);
    assert.equal(store.conflict, false); assert.equal(store.needsSync, true); assert.equal(store.dirty, true); assert.deepEqual(store.value, workspace(7, 'light'));
    assert.equal(savedCache().value.settings.theme, 'light'); assert.equal(savedCache().dirty, true); assert.equal(status.at(-1)[0], 'pending');
    const callCount = calls.length; assert.equal(await store.flush(), false); assert.equal(calls.length, callCount);
    // Explicit user choice to load remote resolves the conflict and updates cache.
    responses.push(answer(workspace(8, 'dark'))); assert.deepEqual(await store.useRemote(), workspace(8, 'dark'));
    assert.equal(store.conflict, false); assert.equal(store.dirty, false); assert.deepEqual(savedCache(), { value: workspace(8), dirty: false });
  }
  // An older dirty cache is automatically rebased while retaining pending fields.
  {
    const { store } = fresh(); cacheDraft(workspace(4, 'light'), true); responses.push(answer(workspace(6, 'dark')));
    assert.deepEqual(await store.load(), workspace(6, 'light')); assert.equal(store.conflict, false); assert.equal(timers.size, 1);
    responses.push(answer({ error: 'STORAGE_ERROR' }, 503)); await assert.rejects(store.useRemote());
    assert.deepEqual(store.value, workspace(6, 'light')); assert.equal(store.dirty, true); assert.equal(store.conflict, false);
  }
  // Network errors or malformed save confirmations must preserve the pending draft.
  {
    const { store, status } = fresh(); responses.push(answer(workspace(1))); await store.load(); store.changed();
    responses.push(new TypeError('Offline')); assert.equal(await store.flush(), false); assert.equal(store.dirty, true); assert.equal(store.value.revision, 1);
    assert.equal(status.at(-1)[0], 'offline'); assert.equal(savedCache().dirty, true);
    responses.push(answer({ ok: true })); assert.equal(await store.flush(), false); assert.equal(store.dirty, true); assert.equal(store.value.revision, 1);
  }
  // The active save cannot be overwritten by useRemote while its acknowledgement is pending.
  {
    const { store } = fresh(); responses.push(answer(workspace(1))); await store.load(); store.changed();
    let resolveSave; responses.push(() => new Promise(resolve => { resolveSave = resolve; })); const saving = store.flush();
    const previousCount = calls.length; await assert.rejects(store.useRemote(), /Дождитесь/); assert.equal(calls.length, previousCount);
    resolveSave(answer({ ok: true, revision: 2 })); await saving;
  }
  // Attachment calls match the backend's raw-body and encoded-filename contract.
  {
    const { store } = fresh(); const file = new File([new Uint8Array([137, 80, 78, 71])], 'Мой вход.png', { type: 'image/png' });
    responses.push(answer({ id: 'image-id', url: '/api/attachments/image-id', name: file.name }, 201));
    await store.attachment(file); assert.equal(calls[0].url, '/api/attachments'); assert.equal(calls[0].options.body, file);
    assert.equal(calls[0].options.headers['Content-Type'], 'image/png'); assert.equal(calls[0].options.headers['X-Filename'], encodeURIComponent(file.name));
    const previousCount = calls.length; await assert.rejects(store.attachment(new File(['text'], 'danger.svg', { type: 'image/svg+xml' }))); assert.equal(calls.length, previousCount);
  }
  assert.equal(escapeHTML('<img src=x onerror="x">&'), '&lt;img src=x onerror=&quot;x&quot;&gt;&amp;');

  // A pagehide save can succeed while its response is lost. Identical remote data
  // should update the local revision without falsely reporting a data conflict.
  {
    const { store, status } = fresh(); cacheDraft(workspace(9, 'dark'), true); responses.push(answer(workspace(10, 'dark')));
    assert.deepEqual(await store.load(), workspace(10, 'dark'), 'An acknowledged identical remote snapshot should repair a stale cached revision.');
    assert.equal(store.conflict, false); assert.equal(store.dirty, false); assert.equal(status.at(-1)[0], 'saved');
    assert.deepEqual(savedCache(), { value: workspace(10, 'dark'), dirty: false });
  }
  // Background refresh applies clean remote changes and notifies the live UI.
  {
    const {store} = fresh(); responses.push(answer(workspace(1))); await store.load();
    let applied=0; store.onRemote=async previous=>{applied++; assert.equal(previous.revision,1);};
    responses.push(answer(workspace(2,'light'))); assert.equal(await store.refresh(),true);
    assert.equal(store.value.settings.theme,'light'); assert.equal(store.dirty,false); assert.equal(applied,1);
  }
  // An unchanged revision check transfers no body and repairs offline status.
  {
    const {store,status}=fresh(); responses.push(answer(workspace(4))); await store.load();
    responses.push(new Response(null,{status:204})); assert.equal(await store.refresh(),true);
    assert.equal(calls.at(-1).url,'/api/workspace?revision=4'); assert.equal(store.value.revision,4);
    assert.equal(status.at(-1)[0],'saved'); assert.equal(store.dirty,false);
  }
  // A late GET cannot overwrite a new keystroke; the next refresh merges it.
  {
    const {store}=fresh(); responses.push(answer(workspace(1))); await store.load();
    let finish; responses.push(()=>new Promise(resolve=>{finish=resolve;})); const syncing=store.refresh();
    store.value.settings.theme='light'; store.changed();
    const remote={...workspace(2),settings:{theme:'dark',timezone:'Europe/Moscow'}};
    finish(answer(remote)); assert.equal(await syncing,false); assert.equal(store.value.revision,1); assert.equal(store.value.settings.theme,'light');
    responses.push(answer(remote)); await store.refresh();
    assert.equal(store.value.revision,2); assert.deepEqual(store.value.settings,{theme:'light',timezone:'Europe/Moscow'});
    responses.push(answer({ok:true,revision:3})); await store.flush();
    assert.equal(store.dirty,false); assert.equal(JSON.parse(cache.get(CACHE)).base.revision,3);
  }
  // The scheduled retry resolves a revision race and saves both devices' fields.
  {
    const {store,status}=fresh(); responses.push(answer(workspace(1))); await store.load();
    store.value.settings.theme='light'; store.changed(); responses.push(answer({revision:2},409)); await store.flush();
    assert.equal(store.needsSync,true); assert.equal(store.conflict,false);
    const callback=[...timers.values()].at(-1);
    responses.push(answer({...workspace(2),settings:{theme:'dark',timezone:'UTC'}}),answer({ok:true,revision:3}));
    await callback(); assert.equal(store.needsSync,false); assert.equal(store.dirty,false);
    assert.deepEqual(store.value.settings,{theme:'light',timezone:'UTC'}); assert.equal(status.at(-1)[0],'saved');
  }
  assert.equal(responses.length, 0);
  console.log('WorkspaceStore integration passed: cloud/offline cache, generation-aware saves, revision conflicts, explicit remote recovery, failed-save safety, attachment contract and lost-response reload recovery.');
} finally {
  if (savedSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', savedSessionStorage); else delete globalThis.sessionStorage;
  globalThis.fetch = savedGlobals.fetch; globalThis.setTimeout = savedGlobals.setTimeout; globalThis.clearTimeout = savedGlobals.clearTimeout;
  if (savedGlobals.localStorage) Object.defineProperty(globalThis, 'localStorage', savedGlobals.localStorage); else delete globalThis.localStorage;
}
