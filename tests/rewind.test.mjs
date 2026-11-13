import test from "node:test";
import assert from "node:assert/strict";
import { Replay } from "../frontend/src/replay/engine.ts";
const bars = Array.from({ length: 12 }, (_, i) => ({
  time: 1704724200 + i * 60,
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i,
  volume: 100,
}));
const config = { qty: 2, stop: 20, target: 40, fee: 2, slip: 1 };
const chart = { ...config, stop: 0, target: 0, chartProtection: true };
const same = (r) =>
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );

test("rewinding cancels a later entry and protection edits, and branches from the restored state", () => {
  const r = new Replay(bars, "NQ");
  r.step();
  r.openMarket(1, chart);
  r.snapshot();
  r.step();
  r.step();
  r.modifyProtection({ sl: 95 });
  r.snapshot();
  r.step();
  r.modifyProtection({ sl: 100, tp: 120 });
  assert.deepEqual(r.rewindEffects(), ["protection"]);
  r.rewind();
  assert.equal(r.index, 3);
  assert.equal(r.position.sl, 95);
  assert.equal(r.position.tp, null);
  same(r);
  r.rewind();
  assert.equal(r.index, 2);
  assert.equal(r.position.sl, null);
  assert.equal(r.position.riskStop, undefined);
  same(r);
  r.rewind();
  assert.equal(r.index, 1);
  assert.ok(r.position);
  assert.equal(r.position.sl, null);
  assert.ok(r.rewindEffects().includes("orders"));
  r.rewind();
  assert.equal(r.index, 0);
  assert.equal(r.position, null);
  assert.equal(r.canRewind, false);
  r.step();
  r.openMarket(-1, chart);
  r.step();
  assert.equal(r.position.side, -1);
  assert.equal(r.position.sl, null);
  same(r);
});

test("rewind restores fills, pending cancellations, closed and partially closed positions exactly", () => {
  const r = new Replay(bars, "NQ");
  r.queue(1, config);
  r.snapshot();
  r.step();
  assert.ok(r.position);
  assert.ok(r.rewindEffects().includes("orders"));
  r.rewind();
  assert.ok(r.pending);
  assert.equal(r.position, null);
  same(r);
  r.step();
  r.requestClose(1);
  r.snapshot();
  r.step();
  assert.equal(r.position.qty, 1);
  r.rewind();
  assert.equal(r.position.qty, 2);
  assert.equal(r.closePending, true);
  same(r);
  r.step();
  r.step();
  r.closeMarket();
  assert.equal(r.trades.length, 1);
  assert.ok(r.rewindEffects().includes("trades"));
  r.rewind();
  assert.equal(r.trades.length, 0);
  assert.equal(r.position.qty, 1);
  same(r);
  const restored = Replay.restore(
    bars,
    "NQ",
    JSON.parse(JSON.stringify(r.snapshot())),
  );
  assert.equal(restored.canRewind, true);
  restored.rewind();
  same(restored);
});

test("ordinary backward movement needs no trading confirmation and history is sparse", () => {
  const r = new Replay(bars, "NQ");
  for (let i = 0; i < 8; i++) r.step();
  assert.deepEqual(r.rewindEffects(), []);
  assert.equal(r.snapshot().rewind.length, 1);
  r.rewind();
  assert.equal(r.index, 7);
  same(r);
  const old = r.snapshot();
  delete old.rewind;
  const empty = Replay.restore(bars, "NQ", old);
  assert.equal(empty.canRewind, true);
  r.openMarket(1, config);
  const legacy = r.snapshot();
  delete legacy.rewind;
  const position = Replay.restore(bars, "NQ", legacy);
  assert.equal(position.canRewind, false);
  position.step();
  assert.equal(position.canRewind, true);
});

test("chart trades can run without protections and only execute levels actually added", () => {
  for (const side of [1, -1]) {
    const r = new Replay(bars, "NQ");
    r.openMarket(side, chart);
    assert.equal(r.position.sl, null);
    assert.equal(r.position.tp, null);
    assert.equal(r.position.initialRisk, 0);
    r.step();
    r.step();
    same(r);
    r.closeMarket();
    assert.equal(r.trades[0].r, null);
    same(r);
  }
  const r = new Replay(bars, "NQ");
  r.openMarket(1, chart);
  r.modifyProtection({ sl: 99.5 });
  assert.equal(r.position.riskStop, 1.75);
  assert.equal(r.position.initialRisk, 88);
  r.step();
  r.modifyProtection({ sl: 100 });
  assert.equal(r.position.initialRisk, 88);
  r.modifyProtection({ tp: 104 });
  r.step();
  assert.equal(r.trades[0].reason, "TP");
  same(r);
});

test("corrupted rewind frames and phantom protections are rejected", () => {
  const r = new Replay(bars, "NQ");
  r.step();
  r.openMarket(1, chart);
  r.snapshot();
  r.step();
  r.modifyProtection({ sl: 98 });
  const snapshot = r.snapshot();
  for (const mutate of [
    (s) => (s.rewind[0].index = 999),
    (s) => (s.rewind[0].tradeCount = 1),
    (s) => (s.rewind[1].position.entry = 50),
    (s) => (s.rewind[1].position.sl = undefined),
  ]) {
    const bad = structuredClone(snapshot);
    mutate(bad);
    assert.throws(() => Replay.restore(bars, "NQ", bad));
  }
});

test("rewind checkpoints stay bounded during long sessions with frequent SL changes", () => {
  const data = Array.from({ length: 1500 }, (_, i) => ({
    time: 1704724200 + i * 60,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 100,
  }));
  const r = new Replay(data, "NQ");
  r.openMarket(1, chart);
  for (let i = 0; i < 1490; i++) {
    r.modifyProtection({ sl: r.current.close - 10 });
    r.snapshot();
    r.step();
  }
  const saved = r.snapshot();
  assert.ok(saved.rewind.length < 1490);
  assert.ok(JSON.stringify(saved.rewind).length < 530000);
  assert.ok(saved.rewind[0].index > 0);
  const restored = Replay.restore(data, "NQ", saved);
  assert.equal(restored.canRewind, true);
  restored.rewind();
  assert.equal(restored.index, r.index - 1);
});

test("automatic TP exits rewind without retaining their execution or realized result", () => {
  const r = new Replay(bars, "NQ");
  r.openMarket(1, { ...config, target: 2 });
  r.step();
  r.step();
  assert.equal(r.trades[0].reason, "TP");
  const result = r.trades[0].pnl;
  assert.ok(r.rewindEffects().includes("trades"));
  r.rewind();
  assert.equal(r.index, 1);
  assert.equal(r.trades.length, 0);
  assert.ok(r.position);
  same(r);
  r.step();
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].pnl, result);
  same(r);
});

test("rewinding restores a pending order canceled on a later candle", () => {
  const r = new Replay(bars, "NQ");
  r.step();
  r.queue(1, { ...config, kind: "limit", entryPrice: 50 });
  r.step();
  r.cancelOrder();
  assert.ok(r.rewindEffects().includes("orders"));
  r.rewind();
  assert.equal(r.index, 1);
  assert.ok(r.pending);
  assert.equal(r.pending.entryPrice, 50);
  same(r);
});

test("older sessions can fork an earlier clean replay without changing their saved trading state", () => {
  const r = new Replay(bars, "NQ");
  r.step();
  r.openMarket(1, chart);
  r.step();
  r.modifyProtection({ sl: 95 });
  r.step();
  const saved = r.snapshot();
  delete saved.rewind;
  const legacy = Replay.restore(bars, "NQ", saved);
  const before = legacy.snapshot();
  assert.equal(legacy.canRewind, false);
  const fork = legacy.forkBeforeCurrent();
  assert.equal(fork.index, legacy.index - 1);
  assert.equal(fork.position, null);
  assert.equal(fork.pending, null);
  assert.deepEqual(fork.trades, []);
  assert.equal(fork.canRewind, true);
  same(fork);
  fork.rewind();
  assert.equal(fork.index, legacy.index - 2);
  assert.deepEqual(legacy.snapshot(), before);
  assert.equal(new Replay(bars, "NQ").forkBeforeCurrent(), null);
});
