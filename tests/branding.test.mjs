import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  migrateLegacyStorage,
  isCompatibleExport,
} from "../frontend/src/replay/legacy-brand.ts";
class Storage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }
  get length() {
    return this.values.size;
  }
  key(index) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}
test("rename migrates all browser settings and owner-scoped records without overwriting or deleting data", () => {
  const old = {
    "replay-lab-theme": "forest",
    "replay-lab-language": "ru",
    "replay-lab-chart-v3": '{"timezone":"America/New_York"}',
    "replay-lab-workspace-v1:owner":
      '{"sessions":[{"name":"My original session"}]}',
    "replay-lab-drawings:session-1": '[{"type":"trend"}]',
    "replay-lab-drawing-ui:owner": '{"favorites":["trend"]}',
    "eazy-trading-theme": "rose",
    unrelated: "unchanged",
  };
  const storage = new Storage(old);
  migrateLegacyStorage(storage);
  for (const [key, value] of Object.entries(old))
    assert.equal(storage.getItem(key), value);
  for (const [key, value] of Object.entries(old).filter(([key]) =>
    key.startsWith("replay-lab-"),
  )) {
    const next = key.replace("replay-lab-", "eazy-trading-");
    assert.equal(
      storage.getItem(next),
      next === "eazy-trading-theme" ? "rose" : value,
    );
  }
  const after = [...storage.values];
  migrateLegacyStorage(storage);
  assert.deepEqual([...storage.values], after);
});
test("failed migration can retry without deleting originals", () => {
  const storage = new Storage({
    "replay-lab-theme": "blue",
    "replay-lab-language": "ru",
  });
  const original = storage.setItem.bind(storage);
  let writes = 0;
  storage.setItem = (key, value) => {
    if (++writes === 2) throw Error("quota");
    original(key, value);
  };
  migrateLegacyStorage(storage);
  assert.equal(storage.getItem("eazy-trading-storage-migrated-v1"), null);
  assert.equal(storage.getItem("replay-lab-language"), "ru");
  storage.setItem = original;
  migrateLegacyStorage(storage);
  assert.equal(storage.getItem("eazy-trading-language"), "ru");
});
test("current and previous export markers remain compatible", () => {
  for (const [kind, current, legacy] of [
    ["drawing", "eazyTradingDrawing", "replayLabDrawing"],
    ["chartSettings", "eazyTradingChartSettings", "replayLabChartSettings"],
    ["backup", "eazyTradingBackup", "replayLabBackup"],
  ]) {
    assert.ok(isCompatibleExport({ [current]: 1 }, kind));
    assert.ok(isCompatibleExport({ [legacy]: 1 }, kind));
    assert.equal(isCompatibleExport({ [current]: 2 }, kind), false);
    assert.equal(isCompatibleExport(null, kind), false);
  }
});
test("all application packages, page titles and wordmarks use the current project name", async () => {
  for (const [file, name] of [
    ["package.json", "eazy-trading"],
    ["frontend/package.json", "@eazy-trading/frontend"],
    ["backend/package.json", "@eazy-trading/backend"],
    ["packages/orderflow/package.json", "@eazy-trading/orderflow"],
  ])
    assert.equal(JSON.parse(await readFile(file, "utf8")).name, name);
  for (const file of [
    "frontend/app/layout.tsx",
    "frontend/app/workspace.tsx",
    "frontend/app/login/page.tsx",
    "dist/index.html",
    "README.md",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /replay[\s-]?lab|replayLab/i, file);
    assert.match(source, /eazy(?: trading|<span)/, file);
  }
});
