import test from 'node:test';
import assert from 'node:assert/strict';
import {createComparison} from '../dist/terminal.mjs';
import {defaults} from '../dist/settings-model.mjs';

function fixture({past=0}={}){
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 const element=()=>{const classes=new Set();return {hidden:false,textContent:'',events:{},classList:{contains:c=>classes.has(c),toggle(c,next){if(next)classes.add(c);else classes.delete(c);}},setAttribute(key,value){this[key]=value;},append(child){this.child=child;},addEventListener(type,fn){this.events[type]=fn;}};};
 const ids=Object.fromEntries(['compareToggle','comparisonTitle','compareNotice','compareChart','compareInterval','chart','chartPanes','chartCard','chartExpand'].map(id=>[id,element()]));
 const chartMock=()=>{
  const callbacks=[],crosshairCallbacks=[];const result={range:null,rangeSets:0,crosshair:null,data:[],applyOptions(){},addSeries(){const series={applyOptions(){},setData:rows=>{result.data=rows;}};result.series=series;return series;},subscribeCrosshairMove:fn=>crosshairCallbacks.push(fn),emitCrosshair:param=>crosshairCallbacks.forEach(fn=>fn(param)),setCrosshairPosition(price,time,series){this.crosshair={price,time,series};this.emitCrosshair({time,point:{x:1,y:1}});},clearCrosshairPosition(){this.crosshair=null;this.emitCrosshair({});}};
  const scale={getVisibleRange:()=>result.range,setVisibleRange(range){result.range={...range};result.rangeSets++;callbacks.forEach(fn=>fn(range));},getVisibleLogicalRange:()=>result.logical,setVisibleLogicalRange(range){result.logical={...range};},subscribeVisibleTimeRangeChange:fn=>callbacks.push(fn)};result.timeScale=()=>scale;return result;
 };
 const start=1704205800,bars=Array.from({length:past+3},(_,index)=>index-past).map(i=>({time:start+i*60,open:100,high:i===2?999:i<0?101:101+i,low:99,close:i<0?100:100+i,volume:1}));
 const f={start,now:start,tf:1,secondary:null,primary:chartMock(),ids};f.primary.range={from:start-120,to:start+120};const primarySeries=f.primary.addSeries();
 const primaryBars=bars.map(b=>({...b,open:20000,high:20003,low:19999,close:20001}));
 globalThis.document={body:element(),getElementById:id=>ids[id],createElement:()=>element(),querySelector:()=>null,addEventListener(){}};
 globalThis.window={dispatchEvent(){},addEventListener(){},LightweightCharts:{CandlestickSeries:{},createChart:()=>{f.secondary=chartMock();return f.secondary;}}};
 f.comparison=createComparison({primary:f.primary,primarySeries,getPrimaryBars:()=>primaryBars.filter(b=>b.time<=f.now),getTimeframe:()=>f.tf,getDatasets:()=>({ES:{bars}}),getSymbol:()=> 'NQ',getTime:()=>f.now,getPreferences:()=>defaults,onShow:async()=>{}});
 f.open=async()=>{f.comparison.setVisible(true);await new Promise(resolve=>setImmediate(resolve));};
 f.restore=()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;};
 return f;
}

test('secondary pane follows replay and shared timeframe without revealing future prices',async()=>{
 const f=fixture();try{
  await f.open();assert.equal(f.ids.chartPanes.child.hidden,false);assert.equal(f.ids.compareToggle['aria-pressed'],'true');
  assert.equal(f.secondary.data.length,1);assert.equal(f.secondary.data[0].high,101);
  f.now=f.start+60;f.comparison.render();assert.equal(f.secondary.data.length,2);assert.equal(Math.max(...f.secondary.data.map(b=>b.high)),102);
  f.tf=5;f.comparison.render();assert.equal(f.secondary.data.length,1);assert.equal(f.secondary.data[0].high,102);
  f.now=f.start-60;f.comparison.render();assert.deepEqual(f.secondary.data,[]);
  f.comparison.setVisible(false);assert.equal(f.ids.chartPanes.child.hidden,true);
 }finally{f.restore();}
});

test('panning either pane leaves the other pane viewport unchanged',async()=>{
 const f=fixture();try{
  await f.open();const originalPrimary={...f.primary.range};
  f.secondary.timeScale().setVisibleRange({from:f.start-60,to:f.start+240});assert.deepEqual(f.primary.range,originalPrimary);
  const secondaryView={...f.secondary.range};f.primary.timeScale().setVisibleRange({from:f.start-120,to:f.start+300});assert.deepEqual(f.secondary.range,secondaryView);
  const primaryView={...f.primary.range};f.comparison.render();assert.deepEqual(f.primary.range,primaryView);
  f.comparison.setExpanded(true);f.comparison.setExpanded(false);assert.deepEqual(f.primary.range,primaryView);
  assert.ok(f.secondary.data.every(b=>b.time<=f.now));
 }finally{f.restore();}
});

test('secondary keeps its own historical viewport and zoom through refresh and replay',async()=>{
 const f=fixture({past:10});try{
  await f.open();const primaryView={...f.primary.range},pastView={from:0,to:5};f.secondary.timeScale().setVisibleLogicalRange(pastView);
  f.comparison.render();assert.deepEqual(f.secondary.logical,pastView);
  f.now+=60;f.comparison.render();assert.deepEqual(f.secondary.logical,pastView);assert.deepEqual(f.primary.range,primaryView);
  f.secondary.timeScale().setVisibleLogicalRange({from:7,to:17});f.now+=60;f.comparison.render();assert.deepEqual(f.secondary.logical,{from:8,to:18});
  assert.ok(f.secondary.data.every(b=>b.time<=f.now));
 }finally{f.restore();}
});

test('linked crosshairs use each instrument price and clear when a future candle is absent',async()=>{
 const f=fixture();try{
  await f.open();f.primary.emitCrosshair({time:f.start,point:{x:1,y:1}});
  assert.equal(f.secondary.crosshair.time,f.start);assert.equal(f.secondary.crosshair.price,100);
  f.secondary.emitCrosshair({time:f.start,point:{x:1,y:1}});assert.equal(f.primary.crosshair.price,20001);
  f.primary.emitCrosshair({time:f.start+60,point:{x:1,y:1}});assert.equal(f.secondary.crosshair,null);
  f.secondary.emitCrosshair({});assert.equal(f.primary.crosshair,null);
 }finally{f.restore();}
});
