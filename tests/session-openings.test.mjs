import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_OPENINGS,
  nextSessionOpening,
  advanceReplayToOpening,
} from "../frontend/src/replay/session-openings.ts";
import { Replay } from "../frontend/src/replay/engine.ts";
const session = (id) => SESSION_OPENINGS.find((s) => s.id === id);
const bars = (times) =>
  times.map((time) => ({
    time: Date.parse(time) / 1000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
  }));

test("New York and London openings follow their own daylight saving calendars", () => {
  const ny = bars([
    "2024-03-08T13:00Z",
    "2024-03-08T14:30Z",
    "2024-03-11T13:30Z",
    "2024-03-11T14:30Z",
  ]);
  assert.equal(nextSessionOpening(ny, 0, session("new-york")), 1);
  assert.equal(nextSessionOpening(ny, 1, session("new-york")), 2);
  const london = bars([
    "2024-03-11T07:00Z",
    "2024-03-11T08:00Z",
    "2024-04-02T07:00Z",
    "2024-04-02T08:00Z",
  ]);
  assert.equal(nextSessionOpening(london, 0, session("london")), 1);
  assert.equal(nextSessionOpening(london, 1, session("london")), 2);
});

test("Tokyo uses the local weekday; current openings, weekends and missing candles are skipped", () => {
  const data = bars([
    "2024-01-05T00:00Z",
    "2024-01-06T00:00Z",
    "2024-01-07T00:00Z",
    "2024-01-08T00:01Z",
    "2024-01-09T00:00Z",
  ]);
  assert.equal(nextSessionOpening(data, 0, session("asia")), 4);
  assert.equal(nextSessionOpening(data, 4, session("asia")), -1);
});

test("jumping executes pending orders, stops and fees identically to stepping", () => {
  const data = bars([
    "2024-01-08T13:30Z",
    "2024-01-08T13:31Z",
    "2024-01-08T13:32Z",
    "2024-01-08T14:30Z",
  ]);
  data[2].low = 95;
  const skipped = new Replay(data, "NQ");
  skipped.queue(1, { qty: 1, stop: 2, target: 10, fee: 2, slip: 1 });
  const stepped = Replay.restore(data, "NQ", skipped.snapshot());
  const target = nextSessionOpening(data, 0, session("new-york"));
  advanceReplayToOpening(skipped, target);
  while (!stepped.ended) stepped.step();
  assert.deepEqual(skipped.snapshot(), stepped.snapshot());
  assert.equal(skipped.trades.length, 1);
  assert.equal(skipped.trades[0].reason, "SL");
  assert.throws(() => advanceReplayToOpening(skipped, -1));
});
