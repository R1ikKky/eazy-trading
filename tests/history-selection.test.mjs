import test from 'node:test';
import assert from 'node:assert/strict';
import {curatedArchives} from '../dist/curated-data.mjs';
import {selectHistory,historyWindows,selectReplayBars,selectHistories,commonHistoryWindows} from '../dist/history-selection.mjs';
import {readArchive} from '../dist/archive.mjs';
import {dayKey,Replay} from '../dist/engine.mjs';

const records=Object.fromEntries(curatedArchives.map(a=>[a.id,{id:a.id,symbol:a.symbol,kind:a.kind,source:a.source,from:dayKey(a.firstTime),to:dayKey(a.lastTime)}]));
test('paired dates select both actual series and use their shared available periods',()=>{
 const selected=selectHistories(records,['NQ','ES'],'2025-01-01','2025-12-31');
 assert.deepEqual(selected.map(d=>d.id),['curated-NQ-history-2024-2026-v2','curated-ES-history-2024-2026']);
 const shared=commonHistoryWindows(records,['NQ','ES']);
 assert.equal(shared[0].to,'2026-05-04');
 assert.deepEqual(shared.at(-1),{from:'2026-09-09',to:'2026-10-07'});
 assert.throws(()=>selectHistories(records,['NQ','ES'],'2026-06-01','2026-06-05'),/NQ:.*данных нет/);
 assert.equal(selectHistories(records,['ES'],'2026-06-01','2026-06-05')[0].symbol,'ES');
 assert.throws(()=>selectHistories(records,[],'2025-01-01','2025-12-31'),/хотя бы один/);
});
test('dates select current raw NQ history instead of a retired or adjusted series',()=>{
 const january={id:'builtin-NQ-2024-01',symbol:'NQ',source:'hf_market_data',from:'2024-01-01',to:'2024-01-31'};
 const available={...records,[january.id]:january};
 for(const [from,to] of [['2024-01-08','2024-01-12'],['2024-01-01','2024-12-31'],['2025-01-01','2025-12-31']])assert.equal(selectHistory(available,'NQ',from,to).id,'curated-NQ-history-2024-2026-v2');
});
test('recent dates select the correct NQ or ES data without a source choice',()=>{
 for(const symbol of ['NQ','ES'])assert.equal(selectHistory(records,symbol,'2026-09-10','2026-10-06').id,'curated-'+symbol+'-recent-2026');
 assert.equal(selectHistory(records,'ES','2025-01-01','2025-12-31').id,'curated-ES-history-2024-2026');
});
test('summer gaps and unavailable end dates reject instead of shortening a test',()=>{
 for(const symbol of ['NQ','ES']){
  assert.throws(()=>selectHistory(records,symbol,'2026-07-01','2026-08-01'),/За весь выбранный период данных нет/);
  assert.throws(()=>selectHistory(records,symbol,'2026-01-01','2026-10-07'),/2026-09-09/);
  assert.throws(()=>selectHistory(records,symbol,'2026-09-10','2026-12-31'),/данных нет/);
 }
});
test('CSV import is preferred within its dates and normal history remains automatic elsewhere',()=>{
 const csv={id:'my-csv',symbol:'NQ',kind:'archive',source:'user_csv',from:'2025-10-01',to:'2025-10-31'},available={...records,[csv.id]:csv};
 assert.equal(selectHistory(available,'NQ','2025-10-01','2025-10-10',csv.id).id,csv.id);
 assert.equal(selectHistory(available,'NQ','2025-09-01','2025-10-10',csv.id).id,'curated-NQ-history-2024-2026-v2');
 const future={...csv,id:'new-csv',from:'2026-07-01',to:'2026-07-31'};
 assert.equal(selectHistory({...available,[future.id]:future},'NQ','2026-07-01','2026-07-10').id,future.id);
});
test('coverage does not promise a merged price series and adjusted data is not an automatic fallback',()=>{
 const adjusted=curatedArchives.find(a=>a.metadata.adjusted);
 assert.throws(()=>selectHistory({[adjusted.id]:records[adjusted.id]},'NQ','2024-10-01','2024-10-10'),/нет исторических данных/);
 const overlapping={one:{id:'one',symbol:'NQ',from:'2026-01-01',to:'2026-01-20'},two:{id:'two',symbol:'NQ',from:'2026-01-10',to:'2026-02-01'}};
 assert.deepEqual(historyWindows(overlapping,'NQ'),[{from:'2026-01-01',to:'2026-01-20'},{from:'2026-01-10',to:'2026-02-01'}]);
 assert.throws(()=>selectHistory(overlapping,'NQ','2026-01-01','2026-02-01'),/данных нет/);
 assert.throws(()=>selectHistory(records,'NQ','2025-02-30','2025-03-01'),/Проверьте/);
});
test('a Friday-to-Sunday test loads original candles, keeps context and restores exactly',async()=>{
 const bar=(date,minute)=>({time:Date.parse(date+'T14:'+minute+':00Z')/1000,open:20000,high:20001,low:19999,close:20000,volume:1});
 const bars=['2025-10-06','2025-10-10','2025-10-17'].flatMap(date=>[bar(date,'30'),bar(date,'31')]);
 const manifest={kind:'archive',id:'weekend',symbol:'NQ',firstTime:bars[0].time,lastTime:bars.at(-1).time,parts:[{id:'oct',count:bars.length,firstTime:bars[0].time,lastTime:bars.at(-1).time}]};
 const readPart=async()=>({symbol:'NQ',bars});
 const data=await readArchive(manifest,'2025-10-10','2025-10-12',readPart),selected=selectReplayBars(data,'2025-10-10','2025-10-12','all');
 assert.deepEqual(selected.bars,bars.slice(2,4));assert.deepEqual(selected.context,bars.slice(0,2));
 assert.ok(data.bars.every(b=>dayKey(b.time)<='2025-10-12'));
 const replay=new Replay(selected.bars,'NQ');replay.step();const saved=replay.snapshot();
 assert.deepEqual(Replay.restore(selectReplayBars(data,'2025-10-10','2025-10-12','all').bars,'NQ',saved).snapshot(),saved);
 const weekend=await readArchive(manifest,'2025-10-11','2025-10-12',readPart);
 assert.throws(()=>selectReplayBars(weekend,'2025-10-11','2025-10-12','all'),/меньше двух свечей/);
 assert.throws(()=>selectReplayBars(data,'2025-10-06','2025-10-10','all'),/сначала загрузите/);
});
