import test from "node:test";
import assert from "node:assert/strict";
import { Replay } from "../frontend/src/replay/engine.ts";
const start = 1704724200;
const data = (rows) =>
  rows.map(([open, high, low, close, contract], i) => ({
    time: start + i * 60,
    open,
    high,
    low,
    close,
    volume: 100,
    ...(contract ? { contract } : {}),
  }));
const config = { qty: 1, stop: 2, target: 4, fee: 2, slip: 1 };

test("instant entries use only the revealed close and ignore already-seen intrabar extremes", () => {
  const bars = data([
    [100, 130, 70, 101],
    [102, 103, 100, 102],
    [103, 108, 102, 106],
  ]);
  const r = new Replay(bars, "NQ");
  r.openMarket(1, config);
  assert.equal(r.index, 0);
  assert.equal(r.position.entry, 101.25);
  assert.equal(r.position.sl, 99.25);
  assert.equal(r.position.tp, 105.25);
  assert.equal(r.pending, null);
  assert.equal(r.trades.length, 0);
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );
  r.step();
  assert.ok(r.position);
  r.step();
  assert.equal(r.trades[0].reason, "TP");
  assert.equal(r.trades[0].fees, 4);
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );
});
test("instant short entries retain stop and fee execution on future candles", () => {
  const bars = data([
    [100, 130, 70, 101],
    [102, 104, 100, 103],
  ]);
  const r = new Replay(bars, "NQ");
  r.openMarket(-1, config);
  assert.equal(r.position.entry, 100.75);
  r.step();
  assert.equal(r.trades[0].reason, "SL");
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );
});
test("restored immediate fills reject changed prices, timing, and entry-candle exits", () => {
  const bars = data([
    [100, 110, 90, 101],
    [102, 104, 100, 103],
  ]);
  const r = new Replay(bars, "NQ");
  r.openMarket(1, config);
  for (const mutate of [
    (p) => (p.entry += 0.25),
    (p) => (p.entryAtClose = false),
    (p) => (p.kind = "limit"),
    (p) => (p.time += 60),
  ]) {
    const state = r.snapshot();
    mutate(state.position);
    assert.throws(() => Replay.restore(bars, "NQ", state));
  }
});
test("invalid immediate risk or duplicate orders leave the existing replay state intact", () => {
  const bars = data([
    [100, 110, 90, 101],
    [102, 104, 100, 103],
  ]);
  const r = new Replay(bars, "NQ"),
    before = r.snapshot();
  assert.throws(() => r.openMarket(1, { ...config, slip: 100 }));
  assert.deepEqual(r.snapshot(), before);
  r.openMarket(1, config);
  const open = r.snapshot();
  assert.throws(() => r.openMarket(-1, config));
  assert.deepEqual(r.snapshot(), open);
});
test("instant positions close safely across raw contract rolls and restore", () => {
  const bars = data([
    [100, 110, 90, 101, "NQH24"],
    [150, 152, 148, 151, "NQM24"],
  ]);
  const r = new Replay(bars, "NQ");
  r.openMarket(1, config);
  r.modifyProtection({ sl: 100, tp: 108 });
  r.step();
  assert.equal(r.trades[0].reason, "Ролловер");
  assert.equal(r.trades[0].exitTime, start);
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );
});
test("legacy queued market orders still fill on the next open", () => {
  const bars = data([
    [100, 110, 90, 101],
    [104, 105, 103, 104],
  ]);
  const r = new Replay(bars, "NQ");
  r.queue(1, { ...config, stop: 10 });
  assert.equal(r.position, null);
  r.step();
  assert.equal(r.position.entry, 104.25);
  assert.equal(r.position.entryAtClose, undefined);
  assert.deepEqual(
    Replay.restore(bars, "NQ", r.snapshot()).snapshot(),
    r.snapshot(),
  );
  const pending = new Replay(bars, "NQ");
  pending.queue(1, config);
  const invalid = pending.snapshot();
  invalid.pending.entryAtClose = true;
  assert.throws(() => Replay.restore(bars, "NQ", invalid));
});
