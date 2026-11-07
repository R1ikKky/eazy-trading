import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {curatedArchives,readCuratedDataset,decodeCuratedPart,isSupersededCuratedDataset,currentCuratedArchive} from '../frontend/src/replay/curated-data.ts';
import {Replay,dayKey} from '../frontend/src/replay/engine.ts';
import {WorkspaceStore,blankWorkspace} from '../frontend/src/replay/workspace-store.ts';
import {validateWorkspace} from '../frontend/src/replay/workspace-validation.ts';

test('shipped real archives decode exactly, preserve prices and replay across actual contracts',async()=>{
 assert.ok(curatedArchives.length>=2);
 for(const archive of curatedArchives){
  let previous=0,total=0,first,last,contracts=new Set();
  assert.equal(archive.source,'curated_archive');assert.ok(archive.metadata.sourceUrl.startsWith('https://'));
  for(const part of archive.parts){
   const text=await readFile(new URL('../market-archives/'+part.id+'.b64',import.meta.url),'utf8');
   const data=await decodeCuratedPart(text,part,archive.symbol);total+=data.bars.length;first??=data.bars[0].time;last=data.bars.at(-1).time;
   for(const b of data.bars){assert.ok(b.time>previous);assert.equal(dayKey(b.time).slice(0,7),part.month);previous=b.time;if(b.contract)contracts.add(b.contract);}
   const bars=data.bars.slice(0,5),replay=new Replay(bars,archive.symbol);replay.queue(1,{qty:2,stop:1000,target:1000,fee:2.4,slip:1});replay.step();replay.requestClose(1);replay.step();
   const resumed=Replay.restore(bars,archive.symbol,replay.snapshot());resumed.requestClose();resumed.step();assert.equal(resumed.trades.length,1);assert.equal(resumed.trades[0].exits.length,2);
  }
  assert.equal(total,archive.count);assert.equal(first,archive.firstTime);assert.equal(last,archive.lastTime);assert.deepEqual([...contracts].sort(),archive.metadata.contracts);
 }
});

test('new archives survive workspace validation and fetch only requested monthly assets',async()=>{
 const workspace=blankWorkspace();workspace.settings.datasets={};
 for(const a of curatedArchives)workspace.settings.datasets[a.id]={id:a.id,kind:a.kind,name:a.name,source:a.source,symbol:a.symbol,from:dayKey(a.firstTime),to:dayKey(a.lastTime),count:a.count,months:a.months};
 assert.equal(Object.keys(validateWorkspace(workspace).settings.datasets).length,curatedArchives.length);
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);const id=new URL(url,'https://replay.example').pathname.slice('/api/market-data/'.length);return new Response(await readFile(new URL('../market-archives/'+id+'.b64',import.meta.url),'utf8'));};
 try{
  const a=curatedArchives.find(x=>x.id==='curated-NQ-history-2024-2026'),store=new WorkspaceStore();
  const manifest=await store.dataset(a.id);assert.equal(manifest.id,a.id);assert.equal(calls.length,0,'Manifest is already shipped.');
  const data=await store.datasetRange(a.id,'2026-04-10','2026-04-10');assert.equal(data.archive.id,a.id);assert.ok(data.bars.some(b=>dayKey(b.time)==='2026-04-10'));assert.equal(calls.length,2,'March context and April requested range only.');
  assert.ok(calls.every(x=>x.startsWith('/api/market-data/')&&x.includes('?v=')));
 }finally{globalThis.fetch=original;}
});

test('a corrupted packed data asset is rejected before any prices are used',async()=>{
 const a=curatedArchives[0],p=a.parts[0],text=await readFile(new URL('../market-archives/'+p.id+'.b64',import.meta.url),'utf8');
 const damaged=(text[0]==='A'?'B':'A')+text.slice(1);
 await assert.rejects(decodeCuratedPart(damaged,p,a.symbol),/Контрольная сумма/);
 await assert.rejects(readCuratedDataset('curated-unrecognized'),/не найден/);
});

test('restored October fills every missing minute while preserving original candles',async()=>{
 const legacy=curatedArchives.find(a=>a.id==='curated-NQ-history-2024-2026'),current=currentCuratedArchive(legacy.id);
 assert.equal(current.id,'curated-NQ-history-2024-2026-v2');assert.equal(isSupersededCuratedDataset(legacy.id),true);assert.equal(isSupersededCuratedDataset(current.id),false);
 const oldPart=legacy.parts.find(p=>p.month==='2025-10'),newPart=current.parts.find(p=>p.month==='2025-10');
 const read=async p=>(await decodeCuratedPart(await readFile(new URL('../market-archives/'+p.id+'.b64',import.meta.url),'utf8'),p,'NQ')).bars;
 const old=await read(oldPart),bars=await read(newPart),map=new Map(bars.map(b=>[b.time,b]));
 assert.equal(oldPart.sha256,'befc9d8033b7a47084e4c5635402167b1ab9f2d83530f433b2f3c376be1a2bb7');
 assert.equal(bars.length,31380);assert.equal(bars.length-old.length,8767);assert.equal(current.count-legacy.count,8767);
 for(const b of old)assert.deepEqual(map.get(b.time),b,'Existing OHLCV must remain unchanged.');
 for(const day of ['2025-10-21','2025-10-27','2025-10-28','2025-10-29','2025-10-30'])assert.equal(bars.filter(b=>dayKey(b.time)===day).length,1380);
 assert.equal(bars.filter(b=>dayKey(b.time)==='2025-10-31').length,1020);
 assert.deepEqual(map.get(1760990040),{time:1760990040,open:25327.25,high:25335,low:25326.75,close:25328.25,volume:1522});
 assert.ok(bars.every(b=>!b.contract),'No inferred contract identifiers.');
 const oldMap=new Map(old.map(b=>[b.time,b]));let inserted=0;
 for(const b of bars){if(!oldMap.has(b.time))inserted++;}
 assert.equal(inserted,8767);
});

test('saved October positions still restore on their original archive; new tests use complete dates',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{const id=new URL(url,'https://replay.example').pathname.slice('/api/market-data/'.length);return new Response(await readFile(new URL('../market-archives/'+id+'.b64',import.meta.url),'utf8'));};
 try{
  const store=new WorkspaceStore(),legacyId='curated-NQ-history-2024-2026';
  const period=bars=>bars.filter(b=>dayKey(b.time)>='2025-10-20'&&dayKey(b.time)<='2025-10-22');
  const old=await store.datasetRange(legacyId,'2025-10-20','2025-10-22'),oldBars=period(old.bars);
  const replay=new Replay(oldBars,'NQ');replay.queue(1,{qty:2,stop:1000,target:1000,fee:2.4,slip:1});replay.step();
  const saved=replay.snapshot(),resumed=Replay.restore(period((await store.datasetRange(legacyId,'2025-10-20','2025-10-22')).bars),'NQ',saved);
  assert.equal(resumed.current.time,saved.currentTime);assert.deepEqual(resumed.position,saved.position);
  const current=currentCuratedArchive(legacyId),updated=await store.datasetRange(current.id,'2025-10-20','2025-10-22');
  assert.ok(updated.bars.length>old.bars.length);assert.throws(()=>Replay.restore(period(updated.bars),'NQ',saved));
  const filled=await store.datasetRange(current.id,'2025-10-21','2025-10-21');
  const day=filled.bars.filter(b=>dayKey(b.time)==='2025-10-21');assert.equal(day.length,1380);
  const fresh=new Replay(day,'NQ');fresh.queue(-1,{qty:1,stop:1000,target:1000,fee:2.4,slip:1});fresh.step();fresh.requestClose();fresh.step();assert.equal(fresh.trades.length,1);
 }finally{globalThis.fetch=original;}
});
