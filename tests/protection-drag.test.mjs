import test from 'node:test';
import assert from 'node:assert/strict';
import {protectionPrice, installProtectionDrag} from '../frontend/src/replay/protection-drag.ts';

test('dragged SL and TP snap to a tick and stay on their valid side of current price', () => {
  assert.equal(protectionPrice(98.13,'sl',1,100),98.25);
  assert.equal(protectionPrice(105,'sl',1,100),99.75);
  assert.equal(protectionPrice(95,'tp',1,100),100.25);
  assert.equal(protectionPrice(95,'sl',-1,100),100.25);
  assert.equal(protectionPrice(105,'tp',-1,100),99.75);
  assert.equal(protectionPrice(0,'sl',1,100),0.25);
});

test('drag previews without committing, captures the pointer, cancels on Escape, and ignores entry', () => {
  const oldWindow=globalThis.window, listeners={},globalListeners={},captures=new Set(), previews=[],commits=[];
  let starts=0,cancels=0;
  globalThis.window={addEventListener:(name,fn)=>globalListeners[name]=fn};
  const container={classList:{toggle(){}},getBoundingClientRect:()=>({top:20}),addEventListener:(name,fn)=>listeners[name]=fn,setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  try {
    installProtectionDrag({container,chart:{paneSize:()=>({height:400})},series:{priceToCoordinate:p=>300-p*2,coordinateToPrice:y=>(300-y)/2},getPosition:()=>({id:'p',side:1,sl:90,tp:120}),getCurrentPrice:()=>100,canDrag:()=>true,onStart:()=>starts++,onPreview:(...args)=>previews.push(args),onCommit:(...args)=>commits.push(args),onCancel:()=>cancels++});
    const event=y=>({button:0,pointerId:1,clientY:y+20,target:{closest:()=>null},preventDefault(){},stopImmediatePropagation(){}});
    listeners.pointerdown(event(100)); assert.equal(starts,0,'entry is not draggable');
    listeners.pointerdown(event(120)); assert.equal(starts,1);assert.ok(captures.has(1));
    listeners.pointermove(event(130));assert.deepEqual(previews,[['sl',85]]);assert.deepEqual(commits,[]);
    listeners.pointerup(event(130));assert.deepEqual(commits,[['sl',85]]);assert.equal(captures.size,0);
    listeners.pointerdown(event(60));listeners.pointermove(event(50));
    globalListeners.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});
    assert.equal(cancels,1);assert.equal(commits.length,1);assert.equal(captures.size,0);
  } finally {globalThis.window=oldWindow;}
});
