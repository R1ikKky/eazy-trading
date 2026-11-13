import test from 'node:test';
import assert from 'node:assert/strict';
import {executionHistory, createTradeHistory} from '../frontend/src/replay/trade-history.ts';

test('history uses individual execution prices, including partial exits on open positions', () => {
  const trades = [{time: 61, entry: 100.25, side: 1, exitTime: 180, exit: 110, exits:[{time: 121, price: 105.5}, {time: 181, price: 114.5}]}];
  const open = {time: 241, entry: 120, side: -1, exits:[{time:301, price:118.25}]};
  const rows = executionHistory(trades, open, t => Math.floor(t/60)*60);
  assert.deepEqual(rows[0], {side:1,color:'#259176',entry:{time:60,price:100.25},exits:[{time:120,price:105.5},{time:180,price:114.5}]});
  assert.deepEqual(rows[1], {side:-1,color:'#d57470',entry:{time:240,price:120},exits:[{time:300,price:118.25}]});
  assert.deepEqual(executionHistory([{time:1,entry:4,side:1,exitTime:2,exit:5}],null,t=>t)[0].exits,[{time:2,price:5}]);
});

test('arrow tips and straight dashed connections use exact execution coordinates after pan and zoom', () => {
  let primitive, updates=0, offset=0;
  const series={attachPrimitive(p){primitive=p;},priceToCoordinate:p=>500-p*2+offset};
  const history=createTradeHistory(series);
  primitive.attached({chart:{timeScale:()=>({timeToCoordinate:t=>t===0?null:t*10+offset})},requestUpdate:()=>updates++});
  const strokes=[],fills=[];let path=[],dash=[];
  const ctx={save(){},restore(){},rect(){},clip(){},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},setLineDash(d){dash=d;},stroke(){strokes.push({path:[...path],dash:[...dash],color:this.strokeStyle});},fill(){fills.push({path:[...path],color:this.fillStyle});}};
  const draw=()=>history.paneViews()[0].renderer().draw({useMediaCoordinateSpace:fn=>fn({context:ctx,mediaSize:{width:800,height:600}})});
  history.setHistory([{time:1,entry:100.25,side:1,exits:[{time:2,price:110.75}]}],null,t=>t);
  draw();
  assert.equal(updates,1);
  assert.deepEqual(strokes[0],{path:[[10,299.5],[20,278.5]],dash:[5,4],color:'#259176'});
  assert.deepEqual(fills.map(f=>f.path[0]),[[10,299.5],[20,278.5]]);
  assert.ok(fills[0].path[1][1]>299.5,'buy entry points up');
  assert.ok(fills[1].path[1][1]<278.5,'buy exit points down');
  offset=30;draw();
  assert.deepEqual(strokes[1].path,[[40,329.5],[50,308.5]]);
  history.setHistory([{time:1,entry:100.25,side:-1,exits:[{time:2,price:90.75}]}],null,t=>t);
  draw();
  assert.equal(strokes.at(-1).color,'#d57470');
  assert.ok(fills.at(-2).path[1][1]<fills.at(-2).path[0][1],'sell entry points down');
  assert.ok(fills.at(-1).path[1][1]>fills.at(-1).path[0][1],'sell exit points up');
  history.setHistory([{time:0,entry:100,side:1,exits:[{time:2,price:90}]}],null,t=>t);
  const count=fills.length;draw();assert.equal(fills.length,count+1,'exit remains visible when the entry is outside loaded history');
  history.setHistory([],null,t=>t);const n=strokes.length;draw();assert.equal(strokes.length,n);
  primitive.detached();draw();assert.equal(strokes.length,n);
});
