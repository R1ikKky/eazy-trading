import test from 'node:test';
import assert from 'node:assert/strict';
import {importArchive,readArchive,easternTimestamp} from '../dist/archive.mjs';
import {parseCSV} from '../dist/engine.mjs';
const csv=lines=>new Blob(['time,open,high,low,close,volume,contract\n'+lines.join('\n')]);
const row=t=>[t,100,101,99,100,1,'NQH24'].join(',');
test('streamed CSV exceeds old150k cap with bounded month parts and sequential uploads',async()=>{
 const start=Date.UTC(2024,0,2,14,30)/1000,rows=Array.from({length:150002},(_,i)=>row(start+i*60)),counts=[];
 const result=await importArchive(csv(rows),{symbol:'NQ',onPart:async(bars,index)=>{counts.push(bars.length);assert.ok(bars.length<=50000);return {id:'part-'+index};}});
 assert.equal(result.count,150002);assert.ok(counts.length>=4);assert.equal(counts.reduce((a,b)=>a+b,0),150002);assert.ok(result.hasContracts);
});
test('CSV rejects symbol mismatch and repeats across parsing blocks',async()=>{
 await assert.rejects(importArchive(csv([row(1704205800),row(1704205860)]),{symbol:'ES',onPart:async()=>({id:'x'})}),/не соответствует/);
 const rows=Array.from({length:5000},(_,i)=>row(1704205800+i*60));rows.push(rows.at(-1));await assert.rejects(importArchive(csv(rows),{symbol:'NQ',onPart:async()=>({id:'x'})}),/без повторов/);
});
test('FirstRate NY timestamps honor winter, summer, fall fold and reject spring gap',async()=>{
 assert.equal(easternTimestamp('2024-01-02 09:30:00'),Date.UTC(2024,0,2,14,30)/1000);
 assert.equal(easternTimestamp('2024-07-02 09:30:00'),Date.UTC(2024,6,2,13,30)/1000);
 const first=easternTimestamp('2024-11-03 01:30:00');assert.equal(easternTimestamp('2024-11-03 01:30:00',first),first+3600);assert.throws(()=>easternTimestamp('2024-03-10 02:30:00'),/Невозможная/);
 const file=new Blob(['2024-01-02 09:30:00,100,101,99,100,1\n2024-01-02 09:31:00,100,101,99,100,1']);const parts=[];const result=await importArchive(file,{symbol:'NQ',format:'firstrate',onPart:async bars=>{parts.push(bars);return {id:'part'};}});assert.equal(result.count,2);assert.equal(result.hasContracts,false);assert.equal(parts[0][0].time,1704205800);
});
test('Databento ts_event nanoseconds normalize minute timestamps',()=>{
 const bars=parseCSV('ts_event,open,high,low,close,volume,symbol\n1704205800000000000,100,101,99,100,1,NQH4\n1704205860000000000,100,101,99,100,1,NQH4');assert.equal(bars[0].time,1704205800);assert.equal(bars[0].contract,'NQH24');
});
test('range loading reads only matching parts and restores actual archive identity',async()=>{
 const make=t=>({time:t,open:100,high:101,low:99,close:100,volume:1}),jan=[make(1704205800),make(1704205860)],dec=[make(1733149800),make(1733149860)];
 const manifest={kind:'archive',id:'archive',symbol:'NQ',firstTime:jan[0].time,lastTime:dec.at(-1).time,parts:[{id:'jan',count:2,firstTime:jan[0].time,lastTime:jan.at(-1).time},{id:'dec',count:2,firstTime:dec[0].time,lastTime:dec.at(-1).time}]};const calls=[];
 const result=await readArchive(manifest,'2024-12-02','2024-12-02',async id=>{calls.push(id);return {symbol:'NQ',bars:id==='jan'?jan:dec};});assert.deepEqual(calls,['dec']);assert.equal(result.bars.length,2);assert.equal(result.id,'archive');assert.equal(result.archive,manifest);
 await assert.rejects(readArchive(manifest,'2024-12-02','2024-12-02',async()=>({symbol:'ES',bars:dec})),/не соответствует/);
});
