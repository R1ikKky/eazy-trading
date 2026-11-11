// Broker history is deliberately independent of replay instruments and USD pricing.
export type Deal = {
  ticket: string;
  positionId: string;
  timeMsc: number;
  type: number;
  entry: number;
  symbol: string;
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  sl: number;
  tp: number;
};
export type BrokerPosition = {
  ticket: string;
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  price: number;
  profit: number;
  swap: number;
  sl: number;
  tp: number;
};
export type Snapshot = {
  account: { login: string; server: string; currency: string; readOnly: true };
  deals: Deal[];
  positions: BrokerPosition[];
};
export type BrokerTrade = {
  id: string;
  positionId: string;
  symbol: string;
  side: "buy" | "sell";
  openedAt: number;
  closedAt: number | null;
  volume: number;
  remaining: number;
  entryPrice: number;
  exitPrice: number | null;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  net: number;
  fills: string[];
};
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, any>;
}
export function text(value: unknown, max = 200): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error("Invalid text.");
  return value;
}
export function identifier(value: unknown): string {
  const id = text(value, 20);
  if (!/^\d{1,20}$/.test(id) || BigInt(id) > 18446744073709551615n)
    throw new Error("Invalid MT5 identifier.");
  return BigInt(id).toString();
}
function number(value: unknown, min = -1e12, max = 1e12): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid number.");
  return value;
}
export function validateSnapshot(
  raw: unknown,
  login: string,
  server: string,
): Snapshot {
  const s = object(raw),
    a = object(s.account);
  if (
    identifier(a.login) !== login ||
    a.server !== server ||
    a.readOnly !== true
  )
    throw new Error("Account identity or read-only check failed.");
  const currency = text(a.currency, 12);
  if (!/^[A-Za-z0-9]{2,12}$/.test(currency))
    throw new Error("Invalid account currency.");
  if (
    !Array.isArray(s.deals) ||
    s.deals.length > 50000 ||
    !Array.isArray(s.positions) ||
    s.positions.length > 2000
  )
    throw new Error("History exceeds the import limit.");
  const seen = new Set<string>();
  const deals: Deal[] = s.deals.map((raw: unknown) => {
    const d = object(raw),
      ticket = identifier(d.ticket);
    if (seen.has(ticket)) throw new Error("Duplicate deal ticket in snapshot.");
    seen.add(ticket);
    const type = number(d.type, 0, 100),
      entry = number(d.entry, 0, 3),
      timeMsc = number(d.timeMsc, 0, 1e14);
    if (![type, entry, timeMsc].every(Number.isSafeInteger))
      throw new Error("Invalid deal enum or time.");
    const volume = number(d.volume, 0),
      price = number(d.price, 0),
      symbol = text(d.symbol, 64);
    if (type <= 1 && (!symbol || !volume))
      throw new Error("Trade deal needs a symbol and volume.");
    return {
      ticket,
      positionId: identifier(d.positionId),
      timeMsc,
      type,
      entry,
      symbol,
      volume,
      price,
      profit: number(d.profit),
      commission: number(d.commission),
      swap: number(d.swap),
      fee: number(d.fee),
      sl: number(d.sl, 0),
      tp: number(d.tp, 0),
    };
  });
  const positions = s.positions.map((raw: unknown): BrokerPosition => {
    const p = object(raw);
    if (p.side !== "buy" && p.side !== "sell")
      throw new Error("Invalid position side.");
    return {
      ticket: identifier(p.ticket),
      symbol: text(p.symbol, 64),
      side: p.side,
      volume: number(p.volume, 0),
      price: number(p.price, 0),
      profit: number(p.profit),
      swap: number(p.swap),
      sl: number(p.sl, 0),
      tp: number(p.tp, 0),
    };
  });
  return {
    account: { login, server, currency, readOnly: true },
    deals,
    positions,
  };
}

/** Round trips, including scale-ins, partial exits, close-by and netting reversals.
 * Costs retain their broker sign. Separate cash adjustments remain in raw history.
 * Incomplete position histories are excluded instead of inventing an entry price.
 */
export function projectTrades(deals: Deal[]): {
  trades: BrokerTrade[];
  warnings: number;
} {
  const epsilon = (volume: number) => volume * 1e-9;
  type Leg = BrokerTrade & {
    enteredValue: number;
    exitedValue: number;
    exited: number;
  };
  const active = new Map<string, Leg>(),
    invalid = new Set<string>();
  const finished: Leg[] = [];
  const sorted = [...deals].sort(
    (a, b) =>
      a.timeMsc - b.timeMsc || (BigInt(a.ticket) < BigInt(b.ticket) ? -1 : 1),
  );
  const start = (d: Deal): Leg => ({
    id: `${d.positionId}:${d.ticket}`,
    positionId: d.positionId,
    symbol: d.symbol,
    side: d.type === 0 ? "buy" : "sell",
    openedAt: d.timeMsc,
    closedAt: null,
    volume: 0,
    remaining: 0,
    entryPrice: 0,
    exitPrice: null,
    profit: 0,
    commission: 0,
    swap: 0,
    fee: 0,
    net: 0,
    fills: [],
    enteredValue: 0,
    exitedValue: 0,
    exited: 0,
  });
  const costs = (leg: Leg, d: Deal, fraction: number, closing: boolean) => {
    leg.commission += d.commission * fraction;
    leg.fee += d.fee * fraction;
    if (closing) {
      leg.profit += d.profit;
      leg.swap += d.swap;
    } else if (d.entry === 0) {
      leg.profit += d.profit;
      leg.swap += d.swap;
    }
    leg.fills.push(d.ticket);
    leg.net = leg.profit + leg.commission + leg.swap + leg.fee;
  };
  for (const d of sorted) {
    if (d.type > 1) continue;
    if (d.positionId === "0") {
      invalid.add(`ticket:${d.ticket}`);
      continue;
    }
    if (invalid.has(d.positionId)) continue;
    let leg = active.get(d.positionId);
    const same = leg?.side === (d.type === 0 ? "buy" : "sell");
    if (d.entry === 0) {
      if (leg && (!same || leg.symbol !== d.symbol)) {
        invalid.add(d.positionId);
        active.delete(d.positionId);
        continue;
      }
      if (!leg) {
        leg = start(d);
        active.set(d.positionId, leg);
      }
      leg.volume += d.volume;
      leg.remaining += d.volume;
      leg.enteredValue += d.price * d.volume;
      leg.entryPrice = leg.enteredValue / leg.volume;
      costs(leg, d, 1, false);
      continue;
    }
    if (
      !leg ||
      same ||
      leg.symbol !== d.symbol ||
      (d.entry !== 2 && d.volume > leg.remaining + epsilon(leg.volume)) ||
      (d.entry === 2 && d.volume < leg.remaining - epsilon(leg.volume))
    ) {
      invalid.add(d.positionId);
      active.delete(d.positionId);
      continue;
    }
    const closed = Math.min(d.volume, leg.remaining),
      excess = Math.max(0, d.volume - closed);
    costs(leg, d, closed / d.volume, true);
    leg.exited += closed;
    leg.exitedValue += closed * d.price;
    leg.remaining = Math.max(0, leg.remaining - closed);
    leg.exitPrice = leg.exitedValue / leg.exited;
    if (leg.remaining <= epsilon(leg.volume)) {
      leg.remaining = 0;
      leg.closedAt = d.timeMsc;
      finished.push(leg);
      active.delete(d.positionId);
    }
    if (d.entry === 2 && excess > epsilon(d.volume)) {
      const reverse = start(d);
      reverse.volume = reverse.remaining = excess;
      reverse.enteredValue = d.price * excess;
      reverse.entryPrice = d.price;
      costs(reverse, d, excess / d.volume, false);
      active.set(d.positionId, reverse);
    }
  }
  return {
    trades: [...finished, ...active.values()]
      .filter((t) => !invalid.has(t.positionId))
      .map(({ enteredValue, exitedValue, exited, ...t }) => t)
      .sort((a, b) => b.openedAt - a.openedAt),
    warnings: invalid.size,
  };
}
