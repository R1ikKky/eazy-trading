import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {footprint,parseTradeCSV,TradeTape} from '@eazy-trading/orderflow';
import {createRequire} from 'node:module';
const fixture=await readFile(new URL('./fixtures/trades-nq-synthetic.csv',import.meta.url),'utf8');
const events=parseTradeCSV(fixture);
test('exact nanosecond cutoff rebuilds displacement and pullback, including unknown volume',()=>{
 const clock=events[4].timeNs;const candles=footprint(events,'NQ',clock);assert.equal(candles[0].volume,30);assert.equal(candles[0].delta,15);
 const earlier=footprint(events,'NQ',events[1].timeNs);assert.equal(earlier[0].volume,11);assert.equal(earlier[0].high,16400.25);
 assert.equal(footprint(events,'NQ',(BigInt(events[0].timeNs)-1n).toString()).length,0);
 const again=footprint(events,'NQ',clock);assert.deepEqual(again,candles);
 const row=candles[0].rows.find(r=>r.price===16400.25);assert.deepEqual([row.sell,row.buy,row.unknown,row.delta],[2,8,5,6]);
});
test('row grouping and timeframes reconcile without mixing contracts or instruments',()=>{
 const end=events.at(-1).timeNs;const one=footprint(events,'NQ',end);const grouped=footprint(events,'NQ',end,5,4);
 assert.equal(grouped[0].volume,one.reduce((sum,c)=>sum+c.volume,0));assert.equal(grouped[0].rows.reduce((sum,r)=>sum+r.total,0),grouped[0].volume);
 const roll={...events[0],id:'roll',contract:'NQM24'};assert.equal(footprint([...events,roll],'NQ',end).length,3);
 assert.equal(footprint(events,'ES',end).length,0);
});
test('identical reconnect overlap deduplicates; simultaneous distinct trades survive',()=>{
 const tape=new TradeTape();for(const e of [...events,...events])tape.add(e);assert.equal(tape.size,events.length);
 tape.add({...events[0],id:'distinct'});assert.equal(tape.size,events.length+1);
 assert.throws(()=>tape.add({...events[0],size:100}));
});
test('CSV rejects unknown contracts, side guesses, non-tick prices, and unordered events',()=>{
 for(const [a,b]of [['NQH24','NQ.c.0'],[',buy,',',bid,'],['16400.50','16400.51']])assert.throws(()=>parseTradeCSV(fixture.replace(a,b)));
 assert.throws(()=>parseTradeCSV(fixture.split('\n').slice(0,1).concat(fixture.split('\n').slice(1,3).reverse()).join('\n')));
});
const require=createRequire(import.meta.url);
test('feed buffer browser reconnect replaces snapshot and demo overlap does not inflate volume',()=>{
 const {FeedBuffer}=require('../backend/dist/modules/orderflow/orderflow.service.js');const b=new FeedBuffer();
 b.ingest({type:'status',state:'connecting'});for(const event of events)b.ingest({type:'trade',event});
 const initial=b.snapshot(0);assert.equal(initial.reset,true);assert.equal(initial.events.length,8);
 b.ingest({type:'status',state:'interrupted'});events.slice(-3).forEach(event=>b.ingest({type:'trade',event}));
 b.ingest({type:'status',state:'live'});const next=b.snapshot(initial.cursor,initial.epoch);assert.equal(next.events.length,0);assert.equal(next.state,'live');
 b.ingest({type:'gap',message:'Replay window expired'});assert.equal(b.snapshot(0).gaps.length,1);
});
