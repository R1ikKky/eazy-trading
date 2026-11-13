import test from 'node:test';
import assert from 'node:assert/strict';
import {Replay} from '../frontend/src/replay/engine.ts';
const bars=[100,102,103].map((close,i)=>({time:1704724200+i*60,open:close-0.5,high:close+1,low:close-1,close,volume:100}));
const config={qty:2,stop:10,target:20,fee:2,slip:1};

test('an instant entry can be undone only before advancing and leaves no trade or fees',()=>{
 const r=new Replay(bars,'NQ');r.openMarket(1,config);
 assert.equal(r.canCancelEntry,true);
 const restored=Replay.restore(bars,'NQ',r.snapshot());assert.equal(restored.canCancelEntry,true);
 assert.equal(r.cancelEntry(),true);assert.equal(r.position,null);assert.equal(r.realizedNet,0);assert.equal(r.trades.length,0);assert.equal(r.index,0);
 assert.deepEqual(Replay.restore(bars,'NQ',r.snapshot()).snapshot(),r.snapshot());
 r.openMarket(1,config);r.step();assert.equal(r.canCancelEntry,false);assert.equal(r.cancelEntry(),false);assert.ok(r.position);
});

test('closing at the shown market price after advancing charges costs and restores exactly',()=>{
 for(const side of [1,-1]){
  const r=new Replay(bars,'NQ');r.openMarket(side,config);r.step();
  r.closeMarket();assert.equal(r.position,null);assert.equal(r.index,1);assert.equal(r.trades.length,1);
  const trade=r.trades[0];assert.equal(trade.exit,bars[1].close-side*0.25);assert.equal(trade.fees,8);assert.equal(trade.exitTime,bars[1].time);assert.equal(trade.reason,'По рынку');
  assert.deepEqual(Replay.restore(bars,'NQ',r.snapshot()).snapshot(),r.snapshot());
  const forged=r.snapshot();forged.trades[0].exits[0].price+=0.25;assert.throws(()=>Replay.restore(bars,'NQ',forged));
 }
});

test('market close works on the final candle, including a remaining partial position',()=>{
 const r=new Replay(bars,'NQ');r.openMarket(1,config);r.requestClose(1);r.step();r.step();
 assert.equal(r.ended,true);assert.equal(r.position.qty,1);r.closeMarket();assert.equal(r.trades[0].exits.length,2);
 assert.deepEqual(Replay.restore(bars,'NQ',r.snapshot()).snapshot(),r.snapshot());
});

test('an order filled during the current candle closes as a trade rather than undoing the fill',()=>{
 const r=new Replay(bars,'NQ');r.queue(1,{...config,kind:'limit',entryPrice:102});r.step();
 assert.ok(r.position);assert.equal(r.canCancelEntry,false);r.closeMarket();
 assert.equal(r.trades.length,1);assert.deepEqual(Replay.restore(bars,'NQ',r.snapshot()).snapshot(),r.snapshot());
});
