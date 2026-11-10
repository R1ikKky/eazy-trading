import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAWING_TOOLS,
  isDrawingType,
} from "../frontend/src/replay/drawing-catalog.ts";
import { sanitizeDrawing } from "../frontend/src/replay/drawing-schema.ts";
import {
  renderDrawing,
  anchoredVWAP,
  barVolumeProfile,
} from "../frontend/src/replay/drawing-renderer.ts";
const time = 1704205800;
const bars = Array.from({ length: 25 }, (_, i) => ({
  time: time + i * 60,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 10 + i,
  contract: "NQH4",
}));
const points = Array.from({ length: 11 }, (_, i) => ({
  time: time + i * 60,
  price: 100 + (i % 2 ? 8 : -3) + i,
}));
function drawing(tool) {
  return {
    id: "drawing-" + tool.id,
    type: tool.id,
    createdAt: time,
    color: "#99bff1",
    width: 2,
    opacity: 15,
    points: points.slice(0, tool.points > 0 ? tool.points : 2),
    text: "Setup | Risk\nBreak | 1R",
  };
}
class Element {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.textContent = "";
  }
  append(child) {
    this.children.push(child);
  }
}
function render(d, now = time + 20 * 60) {
  const root = new Element("g");
  renderDrawing(d, root, {
    node: (tag, attrs) => new Element(tag, attrs),
    coordinates: (p) => ({ x: 50 + (p.time - time) / 4, y: 400 - p.price * 2 }),
    width: 1000,
    height: 600,
    bars,
    now,
  });
  return root;
}
test("every persistent tool round-trips valid anchors and renders finite geometry", () => {
  const ids = new Set();
  for (const tool of DRAWING_TOOLS) {
    assert.ok(!ids.has(tool.id));
    ids.add(tool.id);
    if (!isDrawingType(tool.id)) continue;
    const d = sanitizeDrawing(drawing(tool));
    assert.ok(d, tool.id);
    assert.deepEqual(sanitizeDrawing(JSON.parse(JSON.stringify(d))), d);
    const root = render(d);
    assert.ok(root.children.length, tool.id + " renders nothing");
    assert.doesNotMatch(
      JSON.stringify(root),
      /NaN|Infinity|undefined/,
      tool.id,
    );
  }
});
test("legacy levels, trends, rays and zones remain readable without new fields", () => {
  for (const type of ["level", "trend", "ray", "zone"]) {
    const d = {
      ...drawing({ id: type, points: 2 }),
      type,
      a: points[0],
      b: ["trend", "zone"].includes(type) ? points[1] : null,
    };
    delete d.points;
    delete d.text;
    const restored = sanitizeDrawing(d);
    assert.ok(restored);
    assert.equal(restored.points, undefined);
    assert.ok(render(restored).children.length);
  }
});
test("rejects malformed geometry, missing anchors and executable or oversized text", () => {
  const original = drawing({ id: "xabcd", points: 5 });
  for (const change of [
    (d) => (d.type = "unknown"),
    (d) => (d.points[0].price = NaN),
    (d) => (d.points[0].time = Infinity),
    (d) => d.points.pop(),
    (d) => (d.points = Array(257).fill(points[0])),
    (d) => (d.color = "url(javascript:test)"),
    (d) => (d.text = "x".repeat(501)),
  ]) {
    const d = structuredClone(original);
    change(d);
    assert.equal(sanitizeDrawing(d), null);
  }
  const note = drawing({ id: "note", points: 1 });
  delete note.text;
  assert.equal(sanitizeDrawing(note), null);
  const noteText = drawing({ id: "note", points: 1 });
  noteText.text = "<script>alert(1)</script>";
  assert.equal(
    render(sanitizeDrawing(noteText)).children.at(-1).textContent,
    noteText.text,
  );
});
test("VWAP uses known volume, excludes future bars and resets at contract roll", () => {
  const sample = [
    { time, high: 12, low: 8, close: 10, volume: 10, contract: "H4" },
    {
      time: time + 60,
      high: 22,
      low: 18,
      close: 20,
      volume: 30,
      contract: "H4",
    },
    {
      time: time + 120,
      high: 1002,
      low: 998,
      close: 1000,
      volume: 1e9,
      contract: "M4",
    },
  ];
  assert.deepEqual(
    anchoredVWAP(sample, time, time + 60).map((b) => b.price),
    [10, 17.5],
  );
  assert.equal(anchoredVWAP(sample, time, time + 120).at(-1).price, 1000);
  assert.equal(anchoredVWAP(sample, time + 60, time + 60)[0].price, 20);
  assert.deepEqual(anchoredVWAP(sample, time + 120, time + 60), []);
});
test("estimated OHLCV profiles conserve revealed volume and cannot leak future bars", () => {
  const bins = barVolumeProfile(bars, time, time + 24 * 60, time + 4 * 60);
  assert.equal(
    bins.reduce((sum, bin) => sum + bin.volume, 0),
    10 + 11 + 12 + 13 + 14,
  );
  assert.deepEqual(
    bins,
    barVolumeProfile(bars.slice(0, 5), time, time + 24 * 60, time + 4 * 60),
  );
  assert.deepEqual(
    barVolumeProfile(bars, time + 5 * 60, time + 24 * 60, time + 4 * 60),
    [],
  );
});

test("partial previews stay finite while multi-point tools are being placed", () => {
  for (const tool of DRAWING_TOOLS.filter((t) => isDrawingType(t.id))) {
    const d = drawing(tool);
    for (let count = 1; count <= d.points.length; count++) {
      const preview = { ...d, points: d.points.slice(0, count) };
      assert.doesNotMatch(
        JSON.stringify(render(preview)),
        /NaN|Infinity|undefined/,
        tool.id + " preview " + count,
      );
    }
  }
});

test("drawing instrument tags survive validation and legacy drawings remain readable", () => {
  const original = drawing({ id: "trend", points: 2 });
  for (const symbol of ["NQ", "ES"])
    assert.equal(sanitizeDrawing({ ...original, symbol }).symbol, symbol);
  assert.equal(sanitizeDrawing({ ...original, symbol: "BTC" }), null);
  assert.equal(Object.hasOwn(sanitizeDrawing(original), "symbol"), false);
});
