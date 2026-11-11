import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  projectTrades,
  validateSnapshot,
} = require("../backend/dist/modules/mt5/ledger.js");
const {
  encrypt,
  decrypt,
  matches,
} = require("../backend/dist/modules/mt5/credentials.js");
const deal = (ticket, overrides = {}) => ({
  ticket: String(ticket),
  positionId: "90071992547409930",
  timeMsc: 1700000000000 + Number(ticket),
  type: 0,
  entry: 0,
  symbol: "EURUSD.a",
  volume: 0.5,
  price: 1.1,
  profit: 0,
  commission: -1,
  swap: 0,
  fee: 0,
  sl: 0,
  tp: 0,
  ...overrides,
});
const snapshot = (deals) => ({
  account: {
    login: "12345678",
    server: "FundingPips-SIM1",
    currency: "EUR",
    readOnly: true,
  },
  deals,
  positions: [],
});
test("MT5 partial exits, scale-ins and signed fees produce one round trip", () => {
  const entries = [
    deal(1),
    deal(2, { volume: 0.25, price: 1.2 }),
    deal(3, {
      type: 1,
      entry: 1,
      volume: 0.25,
      price: 1.3,
      profit: 50,
      swap: -2,
      fee: -0.5,
    }),
    deal(4, {
      type: 1,
      entry: 3,
      volume: 0.5,
      price: 1.4,
      profit: 80,
      commission: 0.25,
      fee: -1,
    }),
  ];
  const partial = projectTrades(entries.slice(0, 3));
  assert.equal(partial.trades[0].closedAt, null);
  assert.equal(partial.trades[0].remaining, 0.5);
  const { trades, warnings } = projectTrades(entries.reverse());
  assert.equal(warnings, 0);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.id, "90071992547409930:1");
  assert.equal(t.volume, 0.75);
  assert.equal(t.remaining, 0);
  assert.ok(Math.abs(t.entryPrice - (0.5 * 1.1 + 0.25 * 1.2) / 0.75) < 1e-12);
  assert.ok(Math.abs(t.exitPrice - (0.25 * 1.3 + 0.5 * 1.4) / 0.75) < 1e-12);
  assert.equal(t.net, 123.75);
  assert.equal(t.commission, -2.75);
});
test("MT5 netting reversal splits entry costs but never duplicates realized profit", () => {
  const reversal = [
    deal(1, { volume: 1, commission: -2 }),
    deal(2, {
      type: 1,
      entry: 2,
      volume: 3,
      price: 1.2,
      profit: 100,
      swap: -3,
      commission: -6,
      fee: -3,
    }),
  ];
  const r = projectTrades(reversal);
  assert.equal(r.trades.length, 2);
  const old = r.trades.find((t) => t.side === "buy"),
    current = r.trades.find((t) => t.side === "sell");
  assert.equal(old.net, 92);
  assert.equal(current.net, -6);
  assert.equal(current.profit, 0);
  assert.equal(current.remaining, 2);
  assert.equal(current.id, "90071992547409930:2");
  const complete = projectTrades([
    ...reversal,
    deal(3, {
      type: 0,
      entry: 1,
      volume: 2,
      price: 1.1,
      profit: 200,
      commission: -4,
    }),
  ]);
  assert.equal(complete.trades.filter((t) => t.closedAt !== null).length, 2);
  assert.equal(
    complete.trades.reduce((n, t) => n + t.net, 0),
    282,
  );
});
test("MT5 tiny fractional volumes retain a partially open position", () => {
  const deals = [
    deal(1, { volume: 1e-10 }),
    deal(2, { type: 1, entry: 1, volume: 5e-11 }),
  ];
  const partial = projectTrades(deals).trades[0];
  assert.equal(partial.closedAt, null);
  assert.equal(partial.remaining, 5e-11);
  assert.notEqual(
    projectTrades([...deals, deal(3, { type: 1, entry: 1, volume: 5e-11 })])
      .trades[0].closedAt,
    null,
  );
});
test("MT5 deposits do not become trades; broken and missing entries are not invented", () => {
  const r = projectTrades([
    deal(1, { type: 2, positionId: "0", volume: 0, profit: 50000 }),
    deal(2, { type: 1, entry: 1 }),
    deal(3, { positionId: "8" }),
    deal(4, { positionId: "8", type: 1, entry: 1, volume: 2 }),
  ]);
  assert.equal(r.trades.length, 0);
  assert.equal(r.warnings, 2);
});
test("MT5 hedged positions remain independent; timestamps and 64-bit ticket order survive", () => {
  const r = projectTrades([
    deal("9007199254740993", { timeMsc: 1700000000000 }),
    deal("9007199254740992", { timeMsc: 1700000000000 }),
    deal(2, { positionId: "77", type: 1 }),
  ]);
  assert.equal(r.trades.length, 2);
  assert.equal(
    r.trades.find((t) => t.positionId !== "77").id,
    "90071992547409930:9007199254740992",
  );
});
test("MT5 import rejects another account, master permission, duplicates, numbers-as-identifiers, NaN and invalid volume", () => {
  const s = snapshot([
    deal("18446744073709551615", { timeMsc: 1700000000000 }),
  ]);
  assert.equal(
    validateSnapshot(s, "12345678", "FundingPips-SIM1").deals[0].ticket,
    "18446744073709551615",
  );
  for (const bad of [
    { ...s, account: { ...s.account, login: "99" } },
    { ...s, account: { ...s.account, server: "FundingPips2-SIM" } },
    { ...s, account: { ...s.account, readOnly: false } },
    snapshot([deal(1), deal(1)]),
    snapshot([deal(1, { ticket: 1 })]),
    snapshot([deal(1, { ticket: "18446744073709551616" })]),
    snapshot([deal(1, { volume: -1 })]),
    snapshot([deal(1, { fee: NaN })]),
  ])
    assert.throws(() => validateSnapshot(bad, "12345678", "FundingPips-SIM1"));
});
test("MT5 credentials require a real key and authenticate the owner/account context", () => {
  const old = process.env.MT5_ENCRYPTION_KEY;
  try {
    delete process.env.MT5_ENCRYPTION_KEY;
    assert.throws(() =>
      encrypt("synthetic-investor-password", "owner:account"),
    );
    process.env.MT5_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const a = encrypt("synthetic-investor-password", "owner:account");
    assert.notEqual(a, encrypt("synthetic-investor-password", "owner:account"));
    assert.equal(decrypt(a, "owner:account"), "synthetic-investor-password");
    assert.throws(() => decrypt(a, "other:account"));
    const tampered = Buffer.from(a, "base64");
    tampered[30] ^= 1;
    assert.throws(() => decrypt(tampered.toString("base64"), "owner:account"));
    assert.equal(matches("secret", "secret"), true);
    assert.equal(matches("", "secret"), false);
  } finally {
    if (old === undefined) delete process.env.MT5_ENCRYPTION_KEY;
    else process.env.MT5_ENCRYPTION_KEY = old;
  }
});
