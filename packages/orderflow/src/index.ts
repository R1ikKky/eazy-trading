export const contracts = {
  NQ: { name: "E-mini Nasdaq-100", point: 20, tick: 0.25 },
  ES: { name: "E-mini S&P 500", point: 50, tick: 0.25 },
};
export type Instrument = keyof typeof contracts;
export type Aggressor = "buy" | "sell" | "unknown";
export interface TradeEvent {
  id: string;
  timeNs: string;
  instrument: Instrument;
  contract: string;
  price: number;
  size: number;
  side: Aggressor;
}
export interface FootprintRow {
  price: number;
  buy: number;
  sell: number;
  unknown: number;
  total: number;
  delta: number;
}
export interface FootprintCandle {
  time: number;
  contract: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  delta: number;
  rows: FootprintRow[];
}
export const seconds = (ns: string) => Number(BigInt(ns) / 1000000n) / 1000;
export function instrumentOf(contract: string): Instrument {
  const root = /^(NQ|ES)[HMUZ](?:\d{1,2}|\d{4})$/.exec(contract)?.[1];
  if (root !== "NQ" && root !== "ES")
    throw Error("Exact quarterly NQ/ES contract required");
  return root;
}
export function validateTrade(value: unknown): TradeEvent {
  const t = value as TradeEvent;
  if (
    !t ||
    typeof t.id !== "string" ||
    !t.id ||
    t.id.length > 256 ||
    typeof t.timeNs !== "string" ||
    !/^\d{16,19}$/.test(t.timeNs) ||
    BigInt(t.timeNs) > 4102444800000000000n ||
    instrumentOf(t.contract) !== t.instrument ||
    !Number.isSafeInteger(t.size) ||
    t.size < 1 ||
    t.size > 10000000 ||
    !["buy", "sell", "unknown"].includes(t.side) ||
    !Number.isFinite(t.price) ||
    t.price <= 0 ||
    t.price > 1e8 ||
    Math.abs(
      t.price / contracts[t.instrument].tick -
        Math.round(t.price / contracts[t.instrument].tick),
    ) > 1e-7
  )
    throw Error("Invalid trade event");
  return {
    id: t.id,
    timeNs: t.timeNs,
    instrument: t.instrument,
    contract: t.contract,
    price: t.price,
    size: t.size,
    side: t.side,
  };
}
/** Deduplicate identities, retain stable order for simultaneous events, and reconstruct at any clock. */
export class TradeTape {
  private events: TradeEvent[] = [];
  private ids = new Map<string, string>();
  add(input: TradeEvent): boolean {
    const t = validateTrade(input);
    const serialized = JSON.stringify(t);
    if (this.ids.has(t.id)) {
      if (this.ids.get(t.id) !== serialized)
        throw Error("Conflicting trade identity");
      return false;
    }
    this.ids.set(t.id, serialized);
    this.events.push(t);
    return true;
  }
  all(): TradeEvent[] {
    return this.events
      .slice()
      .sort((a, b) =>
        BigInt(a.timeNs) < BigInt(b.timeNs)
          ? -1
          : BigInt(a.timeNs) > BigInt(b.timeNs)
            ? 1
            : 0,
      );
  }
  get size() {
    return this.events.length;
  }
}
export function footprint(
  events: readonly TradeEvent[],
  instrument: Instrument,
  cutoffNs: string,
  minutes = 1,
  grouping = 1,
  bucket: (seconds: number, minutes: number) => number = (s, m) =>
    Math.floor(s / (m * 60)) * m * 60,
): FootprintCandle[] {
  if (
    !Number.isInteger(grouping) ||
    grouping < 1 ||
    grouping > 100 ||
    !Number.isInteger(minutes) ||
    minutes < 1
  )
    throw Error("Invalid footprint grouping/timeframe");
  const tape = new TradeTape();
  for (const e of events)
    if (e.instrument === instrument && BigInt(e.timeNs) <= BigInt(cutoffNs))
      tape.add(e);
  const candles = new Map<string, FootprintCandle>();
  const levels = new Map<string, Map<number, FootprintRow>>();
  const tick = contracts[instrument].tick;
  for (const t of tape.all()) {
    const time = bucket(seconds(t.timeNs), minutes),
      key = t.contract + ":" + time;
    let c = candles.get(key);
    if (!c) {
      c = {
        time,
        contract: t.contract,
        open: t.price,
        high: t.price,
        low: t.price,
        close: t.price,
        volume: 0,
        delta: 0,
        rows: [],
      };
      candles.set(key, c);
      levels.set(key, new Map());
    }
    c.high = Math.max(c.high, t.price);
    c.low = Math.min(c.low, t.price);
    c.close = t.price;
    c.volume += t.size;
    const price =
      Math.floor(Math.round(t.price / tick) / grouping) * grouping * tick;
    const map = levels.get(key)!;
    let row = map.get(price);
    if (!row) {
      row = { price, buy: 0, sell: 0, unknown: 0, total: 0, delta: 0 };
      map.set(price, row);
    }
    row[t.side] += t.size;
    row.total += t.size;
    const delta = t.side === "buy" ? t.size : t.side === "sell" ? -t.size : 0;
    row.delta += delta;
    c.delta += delta;
  }
  for (const [key, c] of candles) {
    const map = levels.get(key)!;
    const lo = Math.floor(Math.round(c.low / tick) / grouping),
      hi = Math.floor(Math.round(c.high / tick) / grouping);
    if (hi - lo > 20000) throw Error("Price range exceeds footprint row limit");
    for (let n = lo; n <= hi; n++) {
      const price = n * grouping * tick;
      c.rows.push(
        map.get(price) || {
          price,
          buy: 0,
          sell: 0,
          unknown: 0,
          total: 0,
          delta: 0,
        },
      );
    }
  }
  return [...candles.values()].sort((a, b) => a.time - b.time);
}
/** Strict small-file trade import. Never classify an unknown side from price movement. */
export function parseTradeCSV(text: string): TradeEvent[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines.length < 2 || lines.length > 100001)
    throw Error("Import 1–100,000 trades per file");
  const header = lines
    .shift()!
    .split(",")
    .map((s) => s.trim());
  const index = (key: string) => header.indexOf(key);
  for (const key of ["time", "contract", "price", "size", "side"])
    if (index(key) < 0)
      throw Error(
        "Trade CSV headers: time,contract,price,size,side (optional id)",
      );
  const tape = new TradeTape();
  let previous = 0n;
  lines.forEach((line, i) => {
    const row = line.split(",").map((x) => x.trim());
    if (row.length !== header.length) throw Error("Invalid CSV row " + (i + 2));
    const at = (key: string) => row[index(key)];
    const raw = at("time");
    let timeNs: string;
    if (/^\d{16,19}$/.test(raw)) timeNs = raw;
    else {
      if (!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(raw))
        throw Error("Use UTC/offset ISO timestamps or integer nanoseconds");
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms)) throw Error("Invalid timestamp");
      const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(raw)?.[1] || "";
      timeNs = (
        BigInt(Math.floor(ms / 1000)) * 1000000000n +
        BigInt((fraction + "000000000").slice(0, 9))
      ).toString();
    }
    const contract = at("contract");
    const side = (
      {
        B: "buy",
        A: "sell",
        N: "unknown",
        buy: "buy",
        sell: "sell",
        unknown: "unknown",
      } as Record<string, Aggressor>
    )[at("side")];
    if (BigInt(timeNs) < previous)
      throw Error("Trades must be sorted by event time");
    previous = BigInt(timeNs);
    const t = validateTrade({
      id: index("id") >= 0 ? at("id") : "csv-" + i,
      timeNs,
      instrument: instrumentOf(contract),
      contract,
      price: Number(at("price")),
      size: Number(at("size")),
      side,
    });
    tape.add(t);
  });
  return tape.all();
}
