import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalStorage } from '../scripts/local-server.mjs';
import { api } from '../worker/api.mjs';
import { marketArchives } from '../dist/market-archives.mjs';

test('local storage persists workspace, datasets and images across reopening', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'replay-local-'));
  let server;
  try {
    server = await createLocalStorage(dataDir);
    const parts = Object.fromEntries(marketArchives.flatMap(a => a.parts.map(p => [p.id, p])));
    const call = (path, method = 'GET', body, type = 'application/json') => api(new Request('http://127.0.0.1:3000' + path, {
      method, headers: { origin: 'http://127.0.0.1:3000', 'oai-authenticated-user-id': 'local-owner', 'content-type': type },
      ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }),
    }), server.env, parts);
    const workspace = { version: 1, revision: 0, sessions: [{ id: 'pair', datasetId: 'curated-NQ-history-2024-2026-v2', comparisonDatasetId: 'curated-ES-history-2024-2026', note: 'Сохранение' }], playbooks: [], settings: { theme: 'dark' } };
    assert.equal((await call('/api/workspace', 'PUT', workspace)).status, 200);
    const dataset = { id: 'imported', symbol: 'NQ', name: 'CSV import', source: 'test', metadata: {}, bars: [{ time: 1704205800, open: 16600, high: 16601, low: 16599.75, close: 16600.25, volume: 23 }] };
    assert.equal((await call('/api/datasets', 'POST', dataset)).status, 201);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
    const upload = await call('/api/attachments', 'POST', png, 'image/png');
    assert.equal(upload.status, 201);
    const attachment = await upload.json();
    await server.close(); server = undefined;
    server = await createLocalStorage(dataDir);
    assert.deepEqual(await (await call('/api/workspace')).json(), { ...workspace, revision: 1 });
    assert.deepEqual(await (await call('/api/datasets/imported')).json(), dataset);
    const image = await call(attachment.url);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    for (const archive of marketArchives) {
      const part = archive.parts[0];
      assert.equal((await call('/api/market-data/' + part.id + '?v=' + part.sha256)).status, 200);
    }
  } finally { if (server) await server.close(); await rm(dataDir, { recursive: true, force: true }); }
});
