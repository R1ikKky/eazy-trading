import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {curatedArchives,decodeCuratedPart,currentCuratedArchive} from '../frontend/src/replay/curated-data.ts';
import {dayKey,Replay} from '../frontend/src/replay/engine.ts';

const audit=JSON.parse(await readFile(new URL('../market-archives/evidence/summer-2026-gap-fill.json',import.meta.url),'utf8'));
const catalog=new Map(curatedArchives.map(a=>[a.id,a]));
const decode=async(p,symbol)=>(await decodeCuratedPart(await readFile(new URL('../market-archives/'+p.id+'.b64',import.meta.url),'utf8'),p,symbol)).bars;
const cache=new Map();
async function monthBars(a,month){const key=a.id+month;if(!cache.has(key))cache.set(key,decode(a.parts.find(p=>p.month===month),a.symbol));return cache.get(key);}

test('summer gap archives preserve all old source rows, identities and immutable part versions',async()=>{
 assert.deepEqual(JSON.parse(await readFile(new URL('../data/market-archives.json',import.meta.url),'utf8')),curatedArchives);
 for(const [symbol,report] of Object.entries(audit.archives)){
  const next=catalog.get(report.updatedArchive);
  assert.equal(currentCuratedArchive(report.baselineArchive).id,next.id);
  assert.equal(currentCuratedArchive(report.recentArchive).id,next.id);
  assert.equal(next.count,report.oldRowsPreserved+report.insertedBars);
  assert.equal(report.coverage.missingScheduledMinutes,0);
  assert.equal(next.metadata.summerGapFill.source.sha256,audit.sources[symbol==='NQ'?'nq.csv':'es-u.csv'].sha256);
  let oldCount=0;
  for(const previous of [catalog.get(report.baselineArchive),catalog.get(report.recentArchive)]){
   for(const oldPart of previous.parts){
    const part=next.parts.find(p=>p.month===oldPart.month);
    if(part.id===oldPart.id)assert.deepEqual(part,oldPart);
    else{
     const rows=new Map((await monthBars(next,part.month)).map(b=>[b.time,b]));
     for(const b of await decode(oldPart,symbol))assert.deepEqual(rows.get(b.time),b,'Existing OHLCV/contract must stay unchanged.');
    }
    oldCount+=oldPart.count;
   }
  }
  assert.equal(oldCount,report.oldRowsPreserved);
 }
});

test('both instruments contain every RTH minute on every regular summer trading day',async()=>{
 const early=new Set(['2026-05-25','2026-06-19','2026-07-03','2026-09-07']);
 for(const [symbol,report] of Object.entries(audit.archives)){
  const a=catalog.get(report.updatedArchive);
  const lo=Date.parse(report.coverage.fromUTC)/1000,hi=Date.parse(report.coverage.untilUTCExclusive)/1000;
  const available=new Set();
  for(const key of Object.keys(report.monthlyInserted))for(const b of await monthBars(a,key))if(lo<=b.time&&b.time<hi)available.add(b.time);
  // All dates in this bounded repair are EDT (UTC-4). Check individual minutes, not just date labels.
  for(let noon=Date.parse(dayKey(lo)+'T12:00:00Z');noon<Date.parse('2026-09-09T00:00:00Z');noon+=86400000){
   const d=new Date(noon);if([0,6].includes(d.getUTCDay()))continue;
   const date=d.toISOString().slice(0,10),start=Date.parse(date+'T13:30:00Z')/1000;
   for(let i=0;i<(early.has(date)?210:390);i++){
    const t=start+i*60;
    if(lo<=t&&t<hi)assert.ok(available.has(t),symbol+' missing '+new Date(t*1000).toISOString());
   }
  }
 }
});

test('replay uses exact published summer OHLCV with explicit ESU26 and no inferred NQ contract',async()=>{
 const samples={
  NQ:[29955.25,29977.5,29937,29953.5,3579],
  ES:[7612.5,7619.75,7611.75,7616.25,11865],
 };
 const t=Date.parse('2026-07-15T13:30:00Z')/1000;
 for(const [symbol,values] of Object.entries(samples)){
  const rows=await monthBars(catalog.get(audit.archives[symbol].updatedArchive),'2026-07');
  const bar=rows.find(b=>b.time===t);
  assert.deepEqual([bar.open,bar.high,bar.low,bar.close,bar.volume],values);
  assert.equal(bar.contract,symbol==='ES'?'ESU26':undefined);
  const bars=rows.filter(b=>b.time>=t&&b.time<t+600),replay=new Replay(bars,symbol);
  replay.queue(1,{qty:1,stop:1000,target:1000,fee:2.4,slip:1});replay.step();
  const saved=replay.snapshot();assert.deepEqual(Replay.restore(bars,symbol,saved).snapshot(),saved);
  replay.requestClose();replay.step();assert.equal(replay.trades.length,1);
 }
});

test('the actual ES summer boundary closes the old contract without counting its roll gap as profit',async()=>{
 const rows=await monthBars(catalog.get(audit.archives.ES.updatedArchive),'2026-06');
 const index=rows.findIndex(b=>b.contract==='ESU26');
 assert.equal(rows[index-1].contract,'ESM26');
 assert.equal(rows[index].time,Date.parse('2026-06-10T22:00:00Z')/1000);
 const replay=new Replay(rows.slice(index-2,index+2),'ES');
 replay.queue(1,{qty:1,stop:1000,target:1000,fee:0,slip:0});replay.step();replay.step();
 assert.equal(replay.position,null);
 assert.equal(replay.trades[0].reason,'Ролловер');
 assert.equal(replay.trades[0].pnl,(rows[index-1].close-rows[index-1].open)*50);
});
