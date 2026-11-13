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

test("dragging from entry creates SL toward loss and TP toward profit for both sides", () => {
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  try {
    for (const side of [1, -1]) {
      const listeners = {},
        captured = new Set(),
        commits = [];
      const position = {
        id: "entry-drag",
        entry: 100,
        sl: null,
        tp: null,
        side,
      };
      const container = {
        classList: { toggle() {} },
        getBoundingClientRect: () => ({ top: 0 }),
        addEventListener: (n, f) => (listeners[n] = f),
        setPointerCapture: (id) => captured.add(id),
        hasPointerCapture: (id) => captured.has(id),
        releasePointerCapture: (id) => captured.delete(id),
      };
      installProtectionDrag({
        container,
        chart: { paneSize: () => ({ height: 400 }) },
        series: {
          priceToCoordinate: (p) => 300 - p * 2,
          coordinateToPrice: (y) => (300 - y) / 2,
        },
        getPosition: () => position,
        getCurrentPrice: () => 100,
        canDrag: () => true,
        onStart() {},
        onPreview() {},
        onCommit: (kind, price) => {
          commits.push([kind, price]);
          position[kind] = price;
        },
        onCancel() {},
      });
      const e = (y) => ({
        button: 0,
        pointerId: 1,
        clientY: y,
        target: { closest: () => null },
        preventDefault() {},
        stopImmediatePropagation() {},
      });
      listeners.pointerdown(e(100));
      listeners.pointerup(e(100));
      assert.equal(
        commits.length,
        0,
        "a click alone does not create protection",
      );
      listeners.pointerdown(e(100));
      listeners.pointermove(e(100 + side * 20));
      assert.equal(commits.length, 0);
      listeners.pointerup(e(100 + side * 20));
      assert.deepEqual(commits[0], ["sl", 100 - side * 10]);
      listeners.pointerdown(e(100));
      listeners.pointermove(e(100 - side * 20));
      listeners.pointerup(e(100 - side * 20));
      assert.deepEqual(commits[1], ["tp", 100 + side * 10]);
    }
  } finally {
    globalThis.window = oldWindow;
  }
});
