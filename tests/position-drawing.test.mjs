import test from "node:test";
import assert from "node:assert/strict";
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
