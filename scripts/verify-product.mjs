import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Replay,dayKey} from '../dist/engine.mjs';
import {marketData} from '../dist/market-data.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const source=await readFile(resolve(root,'dist/server/index.js'),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
assert.equal(typeof worker.fetch,'function');
const base='https://replay.example';
const page=await worker.fetch(new Request(base+'/'),{});assert.equal(page.status,200);
const html=await page.text(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
const dynamic=new Set(['playbookDialog','playbookForm','playbookName','playbookDescription','playbookRules','journalSearch','journalSymbol','journalStrategy','journalFrom','journalTo','journalTag','tradeNoteForm','tradeStrategy','tradeRules','tradeTags','tradeNote','tradeAttachments','tradeImage','tradeCapture','attachmentStatus','analyticsScope','analyticsCharts','comparisonTitle','compareInterval','compareChart','compareNotice','chartWatermark','chartScaleModes','chartNavigation','chartPaneButton','chartAxisPlus','chartReplayCountdown','chartPriceBadge']);
for(const name of ['app.mjs','product.mjs','terminal.mjs']){const code=await readFile(resolve(root,'dist',name),'utf8');for(const match of code.matchAll(/(?:\$|getElementById)\(['"]([^'"]+)['"]\)/g))assert.ok(ids.includes(match[1])||dynamic.has(match[1]),name+' references missing #'+match[1]);}
for(const path of ['/app.mjs','/product.css','/workspace-store.mjs','/analytics.mjs','/engine.mjs','/vendor/lightweight-charts.standalone.production.js']){const r=await worker.fetch(new Request(base+path),{});assert.equal(r.status,200,path);if(path.endsWith('.mjs'))assert.match(r.headers.get('content-type'),/javascript/);assert.equal((await worker.fetch(new Request(base+path,{method:'HEAD'}),{})).status,200);assert.equal((await worker.fetch(new Request(base+path,{headers:{'if-none-match':r.headers.get('etag')}}),{})).status,304);}
assert.equal((await worker.fetch(new Request(base+'/api/workspace'),{})).status,401);
assert.equal((await worker.fetch(new Request(base+'/missing'),{})).status,404);
for(const [symbol,data] of Object.entries(marketData)){
 const bars=data.rows.map(([time,open,high,low,close,volume,contract])=>({time,open,high,low,close,volume,contract})).filter(b=>dayKey(b.time)>='2024-01-08'&&dayKey(b.time)<='2024-01-12');
 const replay=new Replay(bars,symbol);replay.queue(1,{qty:3,stop:1000,target:1000,fee:2.4,slip:1});replay.step();assert.equal(replay.position.qty,3);replay.requestClose(1);replay.step();assert.equal(replay.position.qty,2);
 const resumed=Replay.restore(bars,symbol,replay.snapshot());assert.equal(resumed.realizedNet,replay.realizedNet);resumed.requestClose();resumed.step();assert.equal(resumed.trades.length,1);assert.equal(resumed.trades[0].qty,3);assert.equal(resumed.trades[0].exits.length,2);assert.equal(Replay.restore(bars,symbol,resumed.snapshot()).trades.length,1);
}
console.log('PASS: generated Worker, static routes/MIME/cache, HTML IDs, auth boundary, real NQ/ES partial exits and restore.');
