import test from "node:test";
import assert from "node:assert/strict";
import {
  positionMetrics,
  positionLabelLayout,
} from "../frontend/src/replay/position-labels.ts";
import {
  movePositionHandle,
  positionHandles,
} from "../frontend/src/replay/position-drawing.ts";

const time = 1704205800;
const make = (type) => ({
  type,
  points: [
    { time, price: 100 },
    { time: time + 600, price: type === "long-position" ? 90 : 110 },
    { time: time + 600, price: type === "long-position" ? 110 : 90 },
  ],
});
for (const type of ["long-position", "short-position"]) {
  test(`${type}: stop and target only move vertically and cannot cross entry`, () => {
    const d = make(type);
    for (const [handle, index] of [
      ["stop", 1],
      ["target", 2],
    ]) {
      const above = d.points[index].price > 100;
      const moved = movePositionHandle(d, handle, 900, above ? -1000 : 1000);
      assert.deepEqual(moved[0], d.points[0]);
      assert.deepEqual(
        moved[index === 1 ? 2 : 1],
        d.points[index === 1 ? 2 : 1],
      );
      assert.equal(moved[index].time, d.points[index].time);
      assert.equal(moved[index].price, above ? 100.25 : 99.75);
      const expanded = movePositionHandle(d, handle, -900, above ? 5 : -5);
      assert.equal(
        expanded[index].price,
        d.points[index].price + (above ? 5 : -5),
      );
    }
  });
  test(`${type}: entry moves in both axes while SL and TP stay fixed`, () => {
    const d = make(type);
    for (const dp of [-1000, 1000]) {
      const moved = movePositionHandle(d, "entry", -120, dp);
      assert.equal(moved[0].time, time - 120);
      assert.equal(moved[0].price, dp < 0 ? 90.25 : 109.75);
      assert.deepEqual(moved.slice(1), d.points.slice(1));
    }
    assert.equal(movePositionHandle(d, "entry", 10000, 0)[0].time, time + 540);
    assert.equal(movePositionHandle(d, "entry", 120, 1.25)[0].price, 101.25);
    assert.deepEqual(d, make(type), "editing never mutates the stored drawing");
  });
  test(`${type}: width handle ignores price movement and cannot invert the box`, () => {
    const d = make(type);
    const wider = movePositionHandle(d, "width", 180, 1000);
    assert.deepEqual(wider[0], d.points[0]);
    assert.deepEqual(
      wider.map((p) => p.price),
      d.points.map((p) => p.price),
    );
    assert.equal(wider[1].time, time + 780);
    assert.equal(wider[2].time, time + 780);
    const narrower = movePositionHandle(d, "width", -10000, -1000);
    assert.equal(narrower[1].time, time + 60);
    assert.equal(narrower[2].time, time + 60);
  });
}
test("position handles stay on the visual left and right edges of older reversed anchors", () => {
  const d = make("long-position");
  d.points[0].time = time + 1200;
  const handles = positionHandles(d);
  for (const handle of handles)
    assert.equal(
      handle.point.time,
      handle.kind === "width" ? time + 1200 : time + 600,
    );
  const moved = movePositionHandle(d, null, 60, 2);
  assert.deepEqual(
    moved.map((p) => p.price),
    [102, 92, 112],
  );
  assert.deepEqual(
    moved.map((p) => p.time),
    [time + 660, time + 1260, time + 1260],
  );
});

test("position metrics use instrument point values, risk settings and revealed prices", () => {
  for (const symbol of ["NQ", "ES"])
    for (const type of ["long-position", "short-position"]) {
      const d = make(type);
      d.symbol = symbol;
      d.accountSize = 1000;
      d.riskPercent = 10;
      d.points[2].price = type === "long-position" ? 120 : 80;
      const mark = type === "long-position" ? 105 : 95;
      const bars = [
        { time: time + 60, close: mark },
        { time: time + 120, close: 1e8 },
      ];
      const result = positionMetrics(d, { bars, now: time + 60 });
      assert.equal(result.riskAmount, 100);
      assert.equal(result.stopAmount, 900);
      assert.equal(result.targetAmount, 1200);
      assert.equal(result.ratio, 2);
      assert.equal(result.quantity, symbol === "NQ" ? 0.5 : 0.2);
      assert.equal(result.pnl, 50);
      assert.match(result.stop[0], /Stop: 10.00 \(10.000%\) 40, Amount: 900/);
      assert.match(
        result.target[0],
        /Target: 20.00 \(20.000%\) 80, Amount: 1200/,
      );
      assert.equal(positionMetrics(d, { bars, now: time - 60 }).pnl, 0);
    }
});

test("selected badges fit narrow and short plots without text or badge overlap", () => {
  const metrics = positionMetrics({
    ...make("long-position"),
    accountSize: 1e6,
    riskPercent: 2,
  });
  for (const width of [1200, 430, 210, 120])
    for (const height of [600, 120, 70]) {
      const badges = positionLabelLayout(
        [
          {
            kind: "stop",
            y: height / 2 + 2,
            lines: metrics.stop,
            color: "red",
          },
          {
            kind: "entry",
            y: height / 2,
            lines: metrics.entry,
            color: "green",
          },
          {
            kind: "target",
            y: height / 2 - 2,
            lines: metrics.target,
            color: "green",
          },
        ],
        { left: width - 50, right: width + 100, width, height },
      );
      for (const [index, badge] of badges.entries()) {
        assert.ok(badge.x >= 0 && badge.x + badge.width <= width);
        assert.ok(badge.top >= 0 && badge.top + badge.height <= height);
        assert.ok(badge.fontSize > 0);
        if (index)
          assert.ok(
            badge.top >= badges[index - 1].top + badges[index - 1].height,
          );
        for (const line of badge.lines)
          assert.ok(line.length * badge.fontSize * 0.56 <= badge.width + 0.01);
      }
    }
});
