import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { api } from '../worker/api.mjs';
import { marketArchives } from '../dist/market-archives.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const parts = Object.fromEntries(marketArchives.flatMap(a => a.parts.map(p => [p.id, p])));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

export async function createLocalStorage(dataDir = resolve(root, '.local-data')) {
  await mkdir(resolve(dataDir, 'objects'), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(resolve(dataDir, 'workspace.sqlite'));
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for (const name of (await readdir(resolve(root, 'drizzle'))).filter(n => n.endsWith('.sql')).sort()) {
    if (database.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) continue;
    database.exec('BEGIN');
    try {
      database.exec(await readFile(resolve(root, 'drizzle', name), 'utf8'));
      database.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); database.close(); throw error; }
  }
  const objectPath = key => resolve(dataDir, 'objects', createHash('sha256').update(key).digest('hex') + '.json');
  const bucket = {
    async get(key) {
      const match = /^curated-market-data\/([^/]+)\/([^/]+)\.b64$/.exec(key);
      if (match) {
        const part = parts[match[1]];
        if (!part || part.sha256 !== match[2]) return null;
        const body = await readFile(resolve(root, 'market-archives', part.id + '.b64'));
        if (createHash('sha256').update(Buffer.from(body.toString(), 'base64')).digest('hex') !== part.sha256) throw Error('Archive checksum mismatch');
        return { body };
      }
      let entry;
      try { entry = JSON.parse(await readFile(objectPath(key), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      const body = Buffer.from(entry.content, 'base64');
      return { body, httpMetadata: entry.httpMetadata, customMetadata: entry.customMetadata, json: async () => JSON.parse(body.toString()) };
    },
    async head(key) { return this.get(key); },
    async put(key, value, options = {}) {
      if (key.startsWith('curated-market-data/')) throw Error('Bundled archives are read-only');
      const path = objectPath(key), temporary = path + '.' + randomUUID();
      await writeFile(temporary, JSON.stringify({ ...options, content: Buffer.from(value).toString('base64') }), { mode: 0o600 });
      await rename(temporary, path);
    },
    async delete(key) { await unlink(objectPath(key)).catch(error => { if (error.code !== 'ENOENT') throw error; }); },
  };
  const env = { BUCKET: bucket, DB: { prepare(sql) {
    const statement = database.prepare(sql);
    return { bind: (...args) => ({ first: async () => statement.get(...args) || null,
      run: async () => ({ success: true, meta: { changes: Number(statement.run(...args).changes) } }) }) };
  } } };
  return { env, close: () => database.close() };
}

export async function startLocalServer({ port = 3000, dataDir } = {}) {
  const storage = await createLocalStorage(dataDir);
  const { env } = storage;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (incoming.headers.host !== new URL(origin).host || (incoming.headers.origin && incoming.headers.origin !== origin) || incoming.headers['sec-fetch-site'] === 'cross-site') {
        outgoing.writeHead(403); outgoing.end('Local requests only'); return;
      }
      const url = new URL(incoming.url, origin);
      let response;
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const headers = new Headers(incoming.headers);
        headers.set('oai-authenticated-user-id', 'local-owner');
        const options = { method: incoming.method, headers };
        if (!['GET', 'HEAD'].includes(incoming.method)) Object.assign(options, { body: Readable.toWeb(incoming), duplex: 'half' });
        response = await api(new Request(url, options), env, parts);
      } else {
        const path = resolve(root, 'dist', '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        const relative = path.slice(resolve(root, 'dist').length + 1);
        if (!path.startsWith(resolve(root, 'dist') + sep) || relative.split(sep).some(p => p.startsWith('.') || p === 'server') || !['GET', 'HEAD'].includes(incoming.method)) {
          response = new Response('Not found', { status: 404 });
        } else {
          try {
            const body = await readFile(path);
            response = new Response(incoming.method === 'HEAD' ? null : body, { headers: { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
          } catch (error) {
            if (!['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) throw error;
            response = new Response('Not found', { status: 404 });
          }
        }
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
      else outgoing.end();
    } catch (error) {
      console.error('Local server:', error.message);
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { storage.close(); throw error; }
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(error => { storage.close(); error ? reject(error) : resolve(); })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startLocalServer({ port: Number(process.env.PORT || 3000) });
  console.log(`Replay Lab: ${server.url}\nДанные: ${resolve(root, '.local-data')}\nИзменения интерфейса доступны после обновления страницы.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
}
