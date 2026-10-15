import assert from 'node:assert/strict';
import {Replay,parseCSV} from '../dist/engine.mjs';
const start=Date.UTC(2024,0,2,14,30)/1000;
const history=rows=>rows.map((r,i)=>({time:start+i*60,open:r[0],high:r[1],low:r[2],close:r[3],volume:100,...(r[4]?{contract:r[4]}:{})}));
const config={qty:1,stop:2,target:4,fee:0,slip:0};
let checks=0;
function test(name,run){run();checks++;console.log('PASS '+name);}

test('market entry uses future open, ambiguous SL wins',()=>{
 const replay=new Replay(history([[100,101,99,100],[101,106,98,102]]),'NQ');
 replay.queue(1,config);assert.equal(replay.position,null);replay.step();
 const t=replay.trades[0];assert.equal(t.entry,101);assert.equal(t.exit,99);assert.equal(t.pnl,-40);assert.equal(t.ambiguous,true);assert.equal(t.exits.length,1);
});
test('buy and sell limit gaps improve fill; never beyond limit',()=>{
 const long=new Replay(history([[100,101,99,100],[97,98,96,97]]),'NQ');long.queue(1,{...config,stop:10,target:10,slip:2,kind:'limit',entryPrice:99});long.step();assert.equal(long.position.entry,97.5);
 const short=new Replay(history([[100,101,99,100],[103,104,102,103]]),'NQ');short.queue(-1,{...config,stop:10,target:10,slip:2,kind:'limit',entryPrice:101});short.step();assert.equal(short.position.entry,102.5);
 const touch=new Replay(history([[100,101,99,100],[100,101,98.5,99]]),'NQ');touch.queue(1,{...config,stop:10,target:10,slip:2,kind:'limit',entryPrice:99});touch.step();assert.equal(touch.position.entry,99);
});
test('stop entries gap to adverse open and pay slippage',()=>{
 const long=new Replay(history([[100,101,99,100],[104,105,103,104]]),'NQ');long.queue(1,{...config,stop:10,target:10,kind:'stop',entryPrice:102,slip:2});long.step();assert.equal(long.position.entry,104.5);
 const short=new Replay(history([[100,101,99,100],[96,97,95,96]]),'NQ');short.queue(-1,{...config,stop:10,target:10,kind:'stop',entryPrice:98,slip:2});short.step();assert.equal(short.position.entry,95.5);
});
test('intrabar limit cannot claim target possibly touched before entry',()=>{
 const replay=new Replay(history([[100,101,99,100],[100,104,99,100],[100,104,99.5,103]]),'NQ');replay.queue(1,{...config,kind:'limit',entryPrice:99,stop:2,target:4});replay.step();assert.equal(replay.trades.length,0);assert.equal(replay.position.entry,99);replay.step();assert.equal(replay.trades[0].exit,103);
});
test('intrabar stop entry must precede a farther favorable target touch',()=>{
 const replay=new Replay(history([[100,101,99,100],[100,107,99,104]]),'NQ');replay.queue(1,{...config,kind:'stop',entryPrice:102,stop:10,target:4});replay.step();assert.equal(replay.trades[0].entry,102);assert.equal(replay.trades[0].exit,106);assert.equal(replay.trades[0].pnl,80);
});
test('partial exits aggregate fees, weighted exit and one trade',()=>{
 const replay=new Replay(history([[100,100,100,100],[100,101,100,101],[102,103,102,103],[104,105,104,105]]),'NQ');
 replay.queue(1,{...config,qty:3,stop:10,target:20,fee:2});replay.step();replay.requestClose(1);replay.step();
 assert.equal(replay.position.qty,2);assert.equal(replay.position.realizedNet,36);assert.equal(replay.realizedNet,36);assert.equal(replay.trades.length,0);assert.equal(replay.stats().count,0);
 replay.requestClose();replay.step();const t=replay.trades[0];assert.equal(replay.position,null);assert.equal(t.qty,3);assert.equal(t.exit,(102+104*2)/3);assert.equal(t.gross,200);assert.equal(t.fees,12);assert.equal(t.pnl,188);assert.equal(t.exits.length,2);assert.equal(replay.realizedNet,188);assert.equal(replay.stats().net,188);
});
test('partial next-open exit leaves protection active for remaining contracts',()=>{
 const bars=history([[100,100,100,100],[100,101,99,101],[102,103,97,100]]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,qty:3,stop:2,target:20,fee:2});replay.step();replay.requestClose(1);replay.step();const t=replay.trades[0];assert.equal(t.exits.length,2);assert.equal(t.exits[0].price,102);assert.equal(t.exits[0].qty,1);assert.equal(t.exits[1].price,98);assert.equal(t.exits[1].qty,2);assert.equal(t.pnl,-52);assert.equal(Replay.restore(bars,'NQ',replay.snapshot()).trades[0].pnl,-52);
});
test('cost-aware breakeven covers commission and exit slippage',()=>{
 const replay=new Replay(history([[100,100,100,100],[100,103,100,103],[103,104,100,101]]),'NQ');replay.queue(1,{...config,stop:10,target:20,fee:2,slip:1});replay.step();assert.equal(replay.position.entry,100.25);replay.breakEven(true);assert.equal(replay.position.sl,100.75);replay.step();assert.equal(replay.trades[0].pnl,1);
 const short=new Replay(history([[100,100,100,100],[100,100,97,97],[97,100,96,99]]),'NQ');short.queue(-1,{...config,stop:10,target:20,fee:2,slip:1});short.step();short.breakEven(true);assert.equal(short.position.sl,99.25);short.step();assert.equal(short.trades[0].pnl,1);
});
test('invalid protections and partial quantity leave state unchanged',()=>{
 const replay=new Replay(history([[100,100,100,100],[100,103,100,102],[102,103,101,102]]),'NQ');replay.queue(1,{...config,stop:10,target:20});replay.step();const before=replay.snapshot();assert.throws(()=>replay.modifyProtection({sl:103}));assert.throws(()=>replay.modifyProtection({tp:101}));assert.throws(()=>replay.requestClose(2));assert.deepEqual(replay.snapshot(),before);
});
test('snapshot roundtrip preserves partial position and pending exit',()=>{
 const bars=history([[100,100,100,100],[100,101,100,101],[102,103,102,103],[104,105,104,105]]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,qty:3,stop:10,target:20,fee:2});replay.step();replay.requestClose(1);replay.step();replay.requestClose(1);const snapshot=replay.snapshot(),restored=Replay.restore(bars,'NQ',snapshot);assert.deepEqual(restored.snapshot(),snapshot);snapshot.position.qty=100;assert.equal(restored.position.qty,2);replay.step();restored.step();assert.deepEqual(restored.snapshot(),replay.snapshot());
});
test('snapshot rejects symbol, future records, changed prices and broken accounting',()=>{
 const bars=history([[100,100,100,100],[100,101,100,101],[102,103,102,103],[104,105,104,105]]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,qty:3,stop:10,target:20,fee:2});replay.step();replay.requestClose(1);replay.step();
 const state=replay.snapshot();assert.throws(()=>Replay.restore(bars,'ES',state));
 const future=structuredClone(state);future.position.exits[0].time=bars[3].time;assert.throws(()=>Replay.restore(bars,'NQ',future));
 const broken=structuredClone(state);broken.position.realizedNet+=100;assert.throws(()=>Replay.restore(bars,'NQ',broken));
 const changed=structuredClone(bars);changed[0].close=100.25;changed[0].high=100.25;assert.throws(()=>Replay.restore(changed,'NQ',state));
});
test('roll closes prior contract and preserves partial accounting',()=>{
 const bars=history([[100,101,99,100,'NQH24'],[100,102,99,102,'NQH24'],[102,103,101,103,'NQH24'],[500,501,499,500,'NQM24']]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,qty:2,stop:10,target:20,fee:2});replay.step();replay.requestClose(1);replay.step();replay.step();const t=replay.trades[0];assert.equal(t.reason,'Ролловер');assert.equal(t.exitTime,bars[2].time);assert.equal(t.exits[1].price,103);assert.equal(t.pnl,92);assert.equal(replay.index,3);assert.equal(Replay.restore(bars,'NQ',replay.snapshot()).trades[0].pnl,92);
});
test('pending limit can be cancelled and is cancelled on contract roll',()=>{
 const bars=history([[100,101,99,100,'NQH24'],[100,101,99,100,'NQH24'],[80,81,79,80,'NQM24']]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,kind:'limit',entryPrice:90});replay.step();assert.ok(replay.pending);assert.equal(Replay.restore(bars,'NQ',replay.snapshot()).pending.entryPrice,90);replay.step();assert.equal(replay.pending,null);assert.equal(replay.position,null);
 const second=new Replay(bars,'NQ');second.queue(1,config);assert.equal(second.cancelOrder(),true);assert.equal(second.cancelOrder(),false);
});
test('restore rejects mathematically rebalanced impossible manual, TP and SL executions',()=>{
 const bars=history([[100,100,100,100],[100,101,99,100],[100,101,99,100]]),replay=new Replay(bars,'NQ');replay.queue(1,{...config,stop:10,target:20});replay.step();replay.requestClose();replay.step();
 const change=(snapshot,value,reason)=>{const t=snapshot.trades[0],e=t.exits[0];e.price=value;e.reason=reason;e.points=(value-t.entry)*t.side;e.gross=e.points*20*e.qty;e.pnl=e.gross-e.fees;t.exit=value;t.reason=reason;t.points=e.points;t.gross=e.gross;t.pnl=e.pnl;t.r=t.pnl/t.initialRisk;t.realizedGross=e.gross;t.realizedNet=e.pnl;return snapshot;};
 assert.ok(Replay.restore(bars,'NQ',replay.snapshot()));
 assert.throws(()=>Replay.restore(bars,'NQ',change(replay.snapshot(),200,'Вручную')));
 const impossibleTarget=change(replay.snapshot(),200,'TP');impossibleTarget.trades[0].exits[0].tp=200;assert.throws(()=>Replay.restore(bars,'NQ',impossibleTarget));
 const impossibleStop=change(replay.snapshot(),200,'SL');impossibleStop.trades[0].exits[0].sl=200;impossibleStop.trades[0].exits[0].tp=300;assert.throws(()=>Replay.restore(bars,'NQ',impossibleStop));
});
test('restore accepts model SL gap and entry slippage extremes',()=>{
 const gapBars=history([[100,100,100,100],[100,101,99,100],[90,91,89,90]]),gap=new Replay(gapBars,'NQ');gap.queue(1,{...config,stop:2,target:20,slip:1});gap.step();gap.step();assert.equal(gap.trades[0].reason,'SL · гэп');assert.equal(gap.trades[0].exit,89.75);assert.ok(Replay.restore(gapBars,'NQ',gap.snapshot()));
 const slipBars=history([[100,100,100,100],[100,102,99,100]]),slip=new Replay(slipBars,'NQ');slip.queue(1,{...config,kind:'stop',entryPrice:101,slip:100,stop:2,target:20});slip.step();assert.equal(slip.trades[0].exit,99);assert.ok(Replay.restore(slipBars,'NQ',slip.snapshot()));
});
test('CSV preserves and normalizes expiry identity; rollover is not profit',()=>{
 const rows=[[100,101,99,100,'NQH4'],[100,102,99,102,'nqh2024'],[500,501,499,500,'NQM24']];
 const csv='time,open,high,low,close,volume,symbol\n'+rows.map((r,i)=>[start+i*60,r[0],r[1],r[2],r[3],100,r[4]].join(',')).join('\n');const bars=parseCSV(csv);assert.equal(bars[0].contract,'NQH24');assert.equal(bars[1].contract,'NQH24');assert.equal(bars[2].contract,'NQM24');const replay=new Replay(bars,'NQ');replay.queue(1,{...config,stop:10,target:20});replay.step();replay.step();assert.equal(replay.trades[0].reason,'Ролловер');assert.equal(replay.trades[0].pnl,40);
 assert.throws(()=>parseCSV(csv.replace('NQM24','ESH24')));assert.throws(()=>parseCSV(csv.replace('NQM24','NQ1!')));
 const generic=csv.split('\n').map(line=>line.split(',').slice(0,-1).join(',')).join('\n');assert.equal(parseCSV(generic)[0].contract,undefined);
});
console.log(checks+' meaningful engine checks passed.');
