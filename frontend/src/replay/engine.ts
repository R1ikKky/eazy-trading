import type {
  Bar,
  Instrument,
  Side,
  OrderOptions,
  PendingOrder,
  Position,
  Trade,
  ReplaySnapshot,
} from "./types";
import { contracts } from "@eazy-trading/orderflow";
export { contracts };
export const tickRound = (v: any) => Math.round(v * 4) / 4;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function dayKey(t: number): string {
  const p = dateFormat.formatToParts(new Date(t * 1000));
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k).value)
    .join("-");
}
export function demo(symbol: Instrument): Bar[] {
  let seed = symbol === "NQ" ? 12843 : 39817;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = [];
  let last = symbol === "NQ" ? 21480 : 6030;
  const scale = symbol === "NQ" ? 1 : 0.3;
  for (let d = 21; d <= 30; d++) {
    const base = Date.UTC(2026, 8, d, 13, 30) / 1000;
    if ([0, 6].includes(new Date(base * 1000).getUTCDay())) continue;
    for (let i = 0; i < 390; i++) {
      let open = last;
      if (i === 0) open = tickRound(last + (random() - 0.5) * 36 * scale);
      const trend = Math.sin(i / 47 + d) * 0.8 + Math.cos(i / 16) * 0.6;
      const close = tickRound(open + ((random() - 0.5) * 13 + trend) * scale);
      const high = tickRound(
          Math.max(open, close) + random() * 5 * scale + 0.25,
        ),
        low = tickRound(Math.min(open, close) - random() * 5 * scale - 0.25);
      out.push({
        time: base + i * 60,
        open,
        high,
        low,
        close,
        volume: Math.round(100 + random() * 900),
      });
      last = close;
    }
  }
  return out;
}
export function aggregate(
  bars: Bar[],
  minutes: number,
  bucket: any = (time: any, minutes: any) =>
    Math.floor(time / (minutes * 60)) * minutes * 60,
) {
  const result = [];
  for (const b of bars) {
    const time = bucket(b.time, minutes);
    let last = result.at(-1);
    if (last?.time === time) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume || 0;
    } else result.push({ ...b, time });
  }
  return result;
}
export function parseCSV(
  text: any,
  { minRows = 2, requireMinuteEvidence = true }: any = {},
) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .filter((x: any) => x.trim());
  if (lines.length < minRows + 1)
    throw Error("Нужны заголовок и минимум " + minRows + " свечи.");
  if (lines.length > 150001)
    throw Error("Максимум 150 000 свечей в одном блоке.");
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (line: any) => {
    const fields = [];
    let value = "",
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === sep && !quoted) {
        fields.push(value.trim());
        value = "";
      } else value += c;
    }
    if (quoted) throw Error("Незакрытые кавычки в CSV.");
    fields.push(value.trim());
    return fields;
  };
  const head = split(lines[0]).map((x) => x.toLowerCase());
  const ti = head.findIndex((x) =>
    ["time", "timestamp", "datetime", "date", "ts_event"].includes(x),
  );
  const indices = ["open", "high", "low", "close"].map((k) => head.indexOf(k));
  const vi = head.indexOf("volume"),
    ci = head.includes("contract")
      ? head.indexOf("contract")
      : head.indexOf("symbol");
  let contractRoot: any = null;
  if (ti < 0 || indices.some((x) => x < 0))
    throw Error(
      "Нужны столбцы time, open, high, low, close; volume — необязательно.",
    );
  const bars: any = lines
    .slice(1)
    .map((line: any, i) => {
      const row = split(line),
        s = row[ti];
      let time;
      if (/^\d+(\.\d+)?$/.test(s)) {
        time = Number(s);
        if (time > 1e17) time /= 1e9;
        else if (time > 1e14) time /= 1e6;
        else if (time > 1e12) time /= 1000;
      } else {
        if (!/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(s))
          throw Error(
            `Строка ${i + 2}: время должно быть Unix или ISO с часовым поясом, например 2026-09-21T09:30:00-04:00.`,
          );
        time = Date.parse(s) / 1000;
      }
      const values = indices.map((k) => (row[k] === "" ? NaN : Number(row[k])));
      const [open, high, low, close] = values;
      if (
        !Number.isSafeInteger(time) ||
        time < 946684800 ||
        time > 4102444800 ||
        values.some((v) => !Number.isFinite(v) || v <= 0)
      )
        throw Error(`Строка ${i + 2}: некорректные дата или цены.`);
      if (time % 60 !== 0)
        throw Error(
          `Строка ${i + 2}: нужны свечи с временем открытия на границе минуты.`,
        );
      if (
        high < Math.max(open, close) ||
        low > Math.min(open, close) ||
        low > high
      )
        throw Error(`Строка ${i + 2}: нарушен порядок OHLC.`);
      if (values.some((v) => Math.abs(v * 4 - Math.round(v * 4)) > 1e-6))
        throw Error(
          `Строка ${i + 2}: цены должны быть кратны тику 0.25 для NQ/ES. Скорректированные цены не поддерживаются.`,
        );
      const volume = vi >= 0 && row[vi] !== "" ? Number(row[vi]) : 0;
      if (!Number.isFinite(volume) || volume < 0)
        throw Error(`Строка ${i + 2}: некорректный объём.`);
      let contract;
      if (ci >= 0) {
        const value = (row[ci] || "").trim().toUpperCase(),
          match = /^(NQ|ES)([HMUZ])(\d{1,2}|\d{4})$/.exec(value);
        if (!match)
          throw Error(
            `Строка ${i + 2}: contract/symbol должен содержать реальный квартальный контракт NQ/ES, например NQH24 или ESH2024.`,
          );
        if (contractRoot && contractRoot !== match[1])
          throw Error("Один CSV должен содержать только NQ или только ES.");
        contractRoot = match[1];
        let year = Number(match[3]);
        if (match[3].length === 1) {
          const barYear = new Date(time * 1000).getUTCFullYear(),
            candidates = [
              Math.floor(barYear / 10) * 10 + year - 10,
              Math.floor(barYear / 10) * 10 + year,
              Math.floor(barYear / 10) * 10 + year + 10,
            ];
          year = candidates.sort(
            (a, b) => Math.abs(a - barYear) - Math.abs(b - barYear),
          )[0];
        } else if (match[3].length === 2) year += 2000;
        if (year < 2000 || year > 2099)
          throw Error(`Строка ${i + 2}: некорректный год контракта.`);
        contract = match[1] + match[2] + String(year % 100).padStart(2, "0");
      }
      return {
        time,
        open,
        high,
        low,
        close,
        volume,
        ...(contract ? { contract } : {}),
      };
    })
    .sort((a: any, b: any) => a.time - b.time);
  for (let i = 1; i < bars.length; i++) {
    const delta = bars[i].time - bars[i - 1].time;
    if (delta < 60) throw Error("Есть повторяющиеся временные метки.");
  }
  // One-minute input is required; gaps between sessions are allowed.
  const minGap = bars
    .slice(1)
    .reduce(
      (m: any, b: any, i: any) => Math.min(m, b.time - bars[i].time),
      Infinity,
    );
  if (requireMinuteEvidence && bars.length > 1 && minGap !== 60)
    throw Error(
      "Загрузите минутные свечи (1m). Старшие таймфреймы строятся внутри сайта.",
    );
  return bars;
}
const onTick = (n: any) =>
  Number.isFinite(n) && Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
const price = (n: any) => onTick(n) && n > 0;
const integer = (n: any, min: any, max: any) =>
  Number.isInteger(n) && n >= min && n <= max;
const near = (a: any, b: any) =>
  Number.isFinite(a) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
const copy = (value: any) => JSON.parse(JSON.stringify(value));
let idSequence = 0;
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  "replay-" +
    Date.now().toString(36) +
    "-" +
    (++idSequence).toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10);
const validId = (id: any) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 100 &&
  /^[a-zA-Z0-9_-]+$/.test(id);
const validReason = (s: any) =>
  typeof s === "string" && s.length > 0 && s.length <= 100;
function checkBars(bars: Bar[], symbol: Instrument) {
  if (
    !contracts[symbol] ||
    !Array.isArray(bars) ||
    !bars.length ||
    bars.length > 1000000
  )
    throw Error("Нет подходящих свечей NQ/ES для реплея.");
  let previous = 0;
  const contractPattern = new RegExp(
    "^" + symbol + "[HMUZ](?:\\d{1,2}|\\d{4})$",
  );
  for (const b of bars) {
    if (
      !b ||
      !Number.isSafeInteger(b.time) ||
      b.time <= 0 ||
      b.time % 60 !== 0 ||
      b.time <= previous ||
      ![b.open, b.high, b.low, b.close].every(price) ||
      b.high < Math.max(b.open, b.close) ||
      b.low > Math.min(b.open, b.close) ||
      b.low > b.high ||
      (b.volume !== undefined &&
        (!Number.isFinite(b.volume) || b.volume < 0)) ||
      (b.contract !== undefined &&
        (typeof b.contract !== "string" || !contractPattern.test(b.contract)))
    )
      throw Error(
        "Некорректная история свечей или контракт другого инструмента.",
      );
    previous = b.time;
  }
}
function signature(bars: Bar[]) {
  let hash = 2166136261;
  for (const b of bars) {
    const s =
      [b.time, b.open, b.high, b.low, b.close, b.contract || ""].join(":") +
      ";";
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16);
}
function validOrder(q: any) {
  return (
    q &&
    validId(q.id) &&
    [1, -1].includes(q.side) &&
    integer(q.qty, 1, 100) &&
    [q.stop, q.target].every((n) => onTick(n) && n >= 0.25) &&
    Number.isFinite(q.fee) &&
    q.fee >= 0 &&
    q.fee <= 100 &&
    integer(q.slip, 0, 100) &&
    ["market", "limit", "stop"].includes(q.kind) &&
    (q.kind === "market" ? q.entryPrice === null : price(q.entryPrice))
  );
}
function fillOrder(q: PendingOrder, b: Bar) {
  const slip = q.slip * 0.25;
  if (q.kind === "market")
    return { entry: tickRound(b.open + q.side * slip), atOpen: true };
  const marketable =
    q.side === 1
      ? q.kind === "limit"
        ? b.open <= q.entryPrice
        : b.open >= q.entryPrice
      : q.kind === "limit"
        ? b.open >= q.entryPrice
        : b.open <= q.entryPrice;
  const touched =
    q.side === 1
      ? q.kind === "limit"
        ? b.low <= q.entryPrice
        : b.high >= q.entryPrice
      : q.kind === "limit"
        ? b.high >= q.entryPrice
        : b.low <= q.entryPrice;
  if (!marketable && !touched) return null;
  if (q.kind === "limit")
    return {
      entry: marketable
        ? tickRound(
            q.side === 1
              ? Math.min(q.entryPrice, b.open + slip)
              : Math.max(q.entryPrice, b.open - slip),
          )
        : q.entryPrice,
      atOpen: marketable,
    };
  return {
    entry: tickRound((marketable ? b.open : q.entryPrice) + q.side * slip),
    atOpen: marketable,
  };
}

export class Replay {
  constructor(bars: Bar[], symbol: Instrument) {
    checkBars(bars, symbol);
    this.bars = bars;
    this.symbol = symbol;
    this.index = 0;
    this.position = null;
    this.pending = null;
    this.closePending = false;
    this.closeQty = null;
    this.trades = [];
    this._signature = signature(bars);
  }
  get current() {
    return this.bars[this.index];
  }
  get ended() {
    return this.index >= this.bars.length - 1;
  }
  get realizedNet() {
    return (
      this.trades.reduce((sum: any, t: any) => sum + t.pnl, 0) +
      (this.position?.realizedNet || 0)
    );
  }
  queue(
    side: Side,
    {
      qty,
      stop,
      target,
      fee = 0,
      slip = 0,
      kind = "market",
      entryPrice = null,
    }: OrderOptions,
  ) {
    if (this.position || this.pending)
      throw Error(
        "В реплее доступна одна позиция или одна ожидающая заявка. Сначала завершите или отмените её.",
      );
    if (this.ended) throw Error("Диапазон завершён. Выберите новый период.");
    const q = {
      id: makeId(),
      side,
      qty,
      stop,
      target,
      fee,
      slip,
      kind,
      entryPrice: kind === "market" ? null : entryPrice,
      queuedIndex: this.index,
      queuedTime: this.current.time,
      queuedContract: this.current.contract || null,
    };
    if (!validOrder(q))
      throw Error(
        "Проверьте объём, тип заявки, цену, стоп, тейк и издержки. Шаг цены — 0.25.",
      );
    const reference = kind === "market" ? this.current.close : q.entryPrice;
    if (reference - side * stop <= 0 || reference + side * target <= 0)
      throw Error("Уровни SL и TP должны быть положительными.");
    this.pending = q;
  }
  openMarket(side: Side, options: OrderOptions) {
    this.queue(side, { ...options, kind: "market", entryPrice: null });
    const q = this.pending!;
    const entry = tickRound(this.current.close + side * q.slip * 0.25);
    const sl = tickRound(entry - side * q.stop),
      tp = tickRound(entry + side * q.target);
    if (
      ![entry, sl, tp].every(price) ||
      (this.current.close - sl) * side <= 0 ||
      (tp - this.current.close) * side <= 0
    ) {
      this.pending = null;
      throw Error("Проверьте цену, защитные уровни и проскальзывание.");
    }
    this.position = {
      ...q,
      contract: this.current.contract || null,
      entry,
      time: this.current.time,
      entryAtOpen: false,
      entryAtClose: true,
      sl,
      tp,
      initialQty: q.qty,
      initialRisk:
        q.stop * contracts[this.symbol].point * q.qty +
        2 * q.fee * q.qty +
        q.slip * 0.25 * contracts[this.symbol].point * q.qty,
      exits: [],
      realizedNet: 0,
      realizedGross: 0,
      realizedFees: 0,
    };
    this.pending = null;
    return this.position;
  }
  cancelOrder() {
    if (!this.pending) return false;
    this.pending = null;
    return true;
  }
  requestClose(qty: number | null = null) {
    if (!this.position) throw Error("Нет открытой позиции.");
    if (this.ended)
      throw Error(
        "Нет следующей свечи для выхода. P&L остаётся нереализованным.",
      );
    if (qty !== null && !integer(qty, 1, this.position.qty))
      throw Error(
        "Количество для выхода должно быть от 1 до оставшегося объёма.",
      );
    this.closePending = true;
    this.closeQty = qty;
  }
  modifyProtection({ sl, tp }: { sl?: number; tp?: number } = {}) {
    if (!this.position) throw Error("Нет открытой позиции.");
    if (sl === undefined && tp === undefined) throw Error("Укажите SL или TP.");
    const p = this.position,
      s = sl === undefined ? p.sl : sl,
      t = tp === undefined ? p.tp : tp;
    if (
      !price(s) ||
      !price(t) ||
      (this.current.close - s) * p.side <= 0 ||
      (t - this.current.close) * p.side <= 0
    )
      throw Error(
        "SL должен быть позади текущей цены, TP — впереди. Шаг цены — 0.25.",
      );
    p.sl = s;
    p.tp = t;
    return { sl: s, tp: t };
  }
  breakEven(includeCosts = false) {
    if (!this.position) throw Error("Нет открытой позиции.");
    if (typeof includeCosts !== "boolean")
      throw Error("Некорректный режим безубытка.");
    const p = this.position,
      cost = includeCosts
        ? (2 * p.fee) / contracts[this.symbol].point + p.slip * 0.25
        : 0;
    const raw = p.entry + p.side * cost;
    const sl = includeCosts
      ? p.side === 1
        ? Math.ceil((raw - 1e-9) * 4) / 4
        : Math.floor((raw + 1e-9) * 4) / 4
      : p.entry;
    if ((this.current.close - sl) * p.side <= 0)
      throw Error(
        "Для переноса стопа цена должна пройти в вашу сторону дальше уровня безубытка.",
      );
    return this.modifyProtection({ sl });
  }
  _exit(priceValue: number, qty: number, reason: string, ambiguous = false) {
    const p = this.position;
    if (!p) return;
    const points = (priceValue - p.entry) * p.side,
      gross = points * contracts[this.symbol].point * qty,
      fees = 2 * p.fee * qty,
      pnl = gross - fees;
    p.exits.push({
      qty,
      price: priceValue,
      time: this.current.time,
      points,
      gross,
      fees,
      pnl,
      reason,
      ambiguous,
      sl: p.sl,
      tp: p.tp,
    });
    p.qty -= qty;
    p.realizedNet += pnl;
    p.realizedGross += gross;
    p.realizedFees += fees;
    this.closePending = false;
    this.closeQty = null;
    if (p.qty) return;
    const exit =
      p.exits.reduce((sum: any, e: any) => sum + e.price * e.qty, 0) /
      p.initialQty;
    this.trades.push({
      ...p,
      qty: p.initialQty,
      remainingQty: 0,
      symbol: this.symbol,
      exit,
      exitTime: this.current.time,
      points: (exit - p.entry) * p.side,
      gross: p.realizedGross,
      fees: p.realizedFees,
      pnl: p.realizedNet,
      r: p.realizedNet / p.initialRisk,
      reason,
      ambiguous: p.exits.some((e: any) => e.ambiguous),
      exits: p.exits.map((e: any) => ({ ...e })),
    });
    this.position = null;
  }
  finish(priceValue: number, reason: string, ambiguous = false) {
    if (this.position)
      this._exit(priceValue, this.position.qty, reason, ambiguous);
  }
  step() {
    if (this.ended) return false;
    const previous = this.current,
      next = this.bars[this.index + 1],
      roll =
        previous.contract &&
        next.contract &&
        previous.contract !== next.contract;
    // Close the old raw contract before its discontinuous roll price. Orders
    // submitted against that contract are cancelled rather than gap-filled.
    if (roll) {
      if (this.position)
        this.finish(
          tickRound(
            previous.close - this.position.side * this.position.slip * 0.25,
          ),
          "Ролловер",
        );
      if (
        this.pending?.queuedContract &&
        this.pending.queuedContract !== next.contract
      )
        this.cancelOrder();
    }
    this.index++;
    const b = this.current;
    let filledNow = false,
      entryAtOpen = true;
    if (this.pending) {
      const q = this.pending,
        fill = fillOrder(q, b);
      if (fill) {
        const entry = fill.entry,
          sl = tickRound(entry - q.side * q.stop),
          tp = tickRound(entry + q.side * q.target);
        if (!price(entry) || !price(sl) || !price(tp)) {
          this.cancelOrder();
          throw Error(
            "Заявка отменена: гэп вывел защитные уровни за допустимый диапазон.",
          );
        }
        this.position = {
          ...q,
          contract: b.contract || null,
          entry,
          time: b.time,
          entryAtOpen: fill.atOpen,
          sl,
          tp,
          initialQty: q.qty,
          initialRisk:
            q.stop * contracts[this.symbol].point * q.qty +
            2 * q.fee * q.qty +
            q.slip * 0.25 * contracts[this.symbol].point * q.qty,
          exits: [],
          realizedNet: 0,
          realizedGross: 0,
          realizedFees: 0,
        };
        this.pending = null;
        filledNow = true;
        entryAtOpen = fill.atOpen;
      }
    }
    let p = this.position;
    if (!p) return true;
    if (!filledNow || entryAtOpen) {
      const gapStop = p.side === 1 ? b.open <= p.sl : b.open >= p.sl,
        gapTarget = p.side === 1 ? b.open >= p.tp : b.open <= p.tp;
      if (gapStop) {
        this.finish(tickRound(b.open - p.side * p.slip * 0.25), "SL · гэп");
        return true;
      }
      if (gapTarget) {
        this.finish(p.tp, "TP");
        return true;
      }
    }
    if (this.closePending) {
      this._exit(
        tickRound(b.open - p.side * p.slip * 0.25),
        this.closeQty ?? p.qty,
        "Вручную",
      );
      p = this.position;
      if (!p) return true;
    }
    const stopHit = p.side === 1 ? b.low <= p.sl : b.high >= p.sl,
      targetHit = p.side === 1 ? b.high >= p.tp : b.low <= p.tp;
    if (stopHit)
      this.finish(
        tickRound(p.sl - p.side * p.slip * 0.25),
        "SL",
        targetHit || (filledNow && !entryAtOpen && p.kind === "stop"),
      );
    // An intrabar entry may occur AFTER the bar's target high/low. A close beyond
    // TP establishes a post-entry target touch; otherwise defer that uncertain TP.
    else if (
      targetHit &&
      (!filledNow ||
        entryAtOpen ||
        p.kind === "stop" ||
        (b.close - p.tp) * p.side >= 0)
    )
      this.finish(p.tp, "TP");
    return true;
  }
  stats() {
    let net = 0,
      peak = 0,
      dd = 0,
      wins = 0,
      gain = 0,
      loss = 0;
    for (const t of this.trades) {
      net += t.pnl;
      peak = Math.max(peak, net);
      dd = Math.max(dd, peak - net);
      if (t.pnl > 0) {
        wins++;
        gain += t.pnl;
      } else loss -= t.pnl;
    }
    return {
      net,
      dd,
      wins,
      count: this.trades.length,
      winRate: this.trades.length ? (wins / this.trades.length) * 100 : null,
      pf: loss ? gain / loss : gain ? Infinity : null,
    };
  }
  snapshot(): ReplaySnapshot {
    return copy({
      version: 1,
      symbol: this.symbol,
      index: this.index,
      currentTime: this.current.time,
      dataSignature: this._signature,
      position: this.position,
      pending: this.pending,
      closePending: this.closePending,
      closeQty: this.closeQty,
      trades: this.trades,
    });
  }
  static restore(bars: Bar[], symbol: Instrument, state: any): Replay {
    const fail = () => {
      throw Error(
        "Сохранённая сессия повреждена или не соответствует истории.",
      );
    };
    checkBars(bars, symbol);
    if (
      !state ||
      typeof state !== "object" ||
      Array.isArray(state) ||
      state.version !== 1 ||
      state.symbol !== symbol ||
      !integer(state.index, 0, bars.length - 1) ||
      state.currentTime !== bars[state.index].time ||
      state.dataSignature !== signature(bars) ||
      !Array.isArray(state.trades) ||
      state.trades.length > bars.length ||
      typeof state.closePending !== "boolean"
    )
      fail();
    const times = new Map<number, number>(
        bars.map((b: any, i: any) => [b.time, i]),
      ),
      seen = new Set();
    const checkQueued = (q: any) => {
      if (
        !validOrder(q) ||
        !integer(q.queuedIndex, 0, state.index) ||
        q.queuedTime !== bars[q.queuedIndex].time ||
        q.queuedContract !== (bars[q.queuedIndex].contract || null)
      )
        fail();
    };
    const checkOrderHistory = (q: any, entryIndex: any = null) => {
      for (let i = q.queuedIndex + 1; i <= (entryIndex ?? state.index); i++) {
        const previous = bars[i - 1],
          next = bars[i];
        if (
          previous.contract &&
          next.contract &&
          previous.contract !== next.contract &&
          q.queuedContract &&
          q.queuedContract !== next.contract
        )
          fail();
        if (fillOrder(q, next) && (entryIndex === null || i < entryIndex))
          fail();
      }
    };
    const checkPosition = (p: any, closed: any) => {
      checkQueued(p);
      const entryIndex = times.get(p.time);
      const instant = p.entryAtClose === true;
      if (
        entryIndex === undefined ||
        entryIndex > state.index ||
        (p.entryAtClose !== undefined && !instant) ||
        (instant
          ? p.kind !== "market" || entryIndex !== p.queuedIndex
          : entryIndex <= p.queuedIndex) ||
        !price(p.entry) ||
        !price(p.sl) ||
        !price(p.tp) ||
        !integer(p.initialQty, 1, 100) ||
        (closed ? p.qty !== p.initialQty : !integer(p.qty, 1, p.initialQty)) ||
        p.contract !== (bars[entryIndex].contract || null) ||
        typeof p.entryAtOpen !== "boolean" ||
        !Array.isArray(p.exits) ||
        p.exits.length > p.initialQty ||
        seen.has(p.id)
      )
        fail();
      seen.add(p.id);
      const originalOrder = { ...p, qty: p.initialQty };
      checkOrderHistory(originalOrder, entryIndex);
      const fill = instant
        ? {
            entry: tickRound(bars[entryIndex].close + p.side * p.slip * 0.25),
            atOpen: false,
          }
        : fillOrder(originalOrder, bars[entryIndex]);
      if (
        !fill ||
        !near(fill.entry, p.entry) ||
        fill.atOpen !== p.entryAtOpen ||
        !near(
          p.initialRisk,
          p.stop * contracts[symbol].point * p.initialQty +
            2 * p.fee * p.initialQty +
            p.slip * 0.25 * contracts[symbol].point * p.initialQty,
        )
      )
        fail();
      let qty = 0,
        net = 0,
        gross = 0,
        fees = 0,
        weighted = 0,
        lastTime = p.time;
      for (const e of p.exits) {
        const i = times.get(e?.time);
        if (
          !e ||
          !integer(e.qty, 1, p.initialQty) ||
          !price(e.price) ||
          !price(e.sl) ||
          !price(e.tp) ||
          (e.tp - e.sl) * p.side <= 0 ||
          i === undefined ||
          i > state.index ||
          e.time < lastTime ||
          !validReason(e.reason) ||
          (instant && i === entryIndex && e.reason !== "Ролловер") ||
          typeof e.ambiguous !== "boolean"
        )
          fail();
        const b = bars[i],
          exitSlip = p.side * p.slip * 0.25,
          intrabarEntry = i === entryIndex && !p.entryAtOpen,
          stopHit = p.side === 1 ? b.low <= e.sl : b.high >= e.sl,
          targetHit = p.side === 1 ? b.high >= e.tp : b.low <= e.tp,
          gapStop = p.side === 1 ? b.open <= e.sl : b.open >= e.sl,
          gapTarget = p.side === 1 ? b.open >= e.tp : b.open <= e.tp;
        if ((b.contract || null) !== p.contract) fail();
        if (
          i === entryIndex &&
          !instant &&
          (e.sl !== tickRound(p.entry - p.side * p.stop) ||
            e.tp !== tickRound(p.entry + p.side * p.target))
        )
          fail();
        if (e.reason === "Вручную") {
          if (
            i <= entryIndex ||
            !near(e.price, tickRound(b.open - exitSlip)) ||
            gapStop ||
            gapTarget ||
            e.ambiguous
          )
            fail();
        } else if (e.reason === "Ролловер") {
          const next = bars[i + 1];
          if (
            !next ||
            i >= state.index ||
            !b.contract ||
            !next.contract ||
            b.contract === next.contract ||
            !near(e.price, tickRound(b.close - exitSlip)) ||
            e.qty !== p.initialQty - qty ||
            e.ambiguous
          )
            fail();
        } else if (e.reason === "SL · гэп") {
          if (
            intrabarEntry ||
            !gapStop ||
            !near(e.price, tickRound(b.open - exitSlip)) ||
            e.qty !== p.initialQty - qty ||
            e.ambiguous
          )
            fail();
        } else if (e.reason === "SL") {
          if (
            !stopHit ||
            (!intrabarEntry && gapStop) ||
            e.price < b.low - p.slip * 0.25 ||
            e.price > b.high + p.slip * 0.25 ||
            !near(e.price, tickRound(e.sl - exitSlip)) ||
            e.qty !== p.initialQty - qty ||
            e.ambiguous !== (targetHit || (intrabarEntry && p.kind === "stop"))
          )
            fail();
        } else if (e.reason === "TP") {
          if (
            !targetHit ||
            (!intrabarEntry && gapStop) ||
            (!gapTarget && stopHit) ||
            !near(e.price, e.tp) ||
            e.qty !== p.initialQty - qty ||
            e.ambiguous ||
            (intrabarEntry &&
              p.kind === "limit" &&
              (b.close - e.tp) * p.side < 0)
          )
            fail();
        } else fail();
        // The exact recorded protective levels establish executions where an edit
        // preceded the bar. They do not authenticate the trader's edit history.
        lastTime = e.time;
        qty += e.qty;
        const points = (e.price - p.entry) * p.side,
          g = points * contracts[symbol].point * e.qty,
          f = 2 * p.fee * e.qty;
        if (
          !near(e.points, points) ||
          !near(e.gross, g) ||
          !near(e.fees, f) ||
          !near(e.pnl, g - f)
        )
          fail();
        net += e.pnl;
        gross += e.gross;
        fees += e.fees;
        weighted += e.price * e.qty;
      }
      if (
        qty !== (closed ? p.initialQty : p.initialQty - p.qty) ||
        !near(p.realizedNet, net) ||
        !near(p.realizedGross, gross) ||
        !near(p.realizedFees, fees)
      )
        fail();
      if (
        !closed &&
        ((bars[state.index].close - p.sl) * p.side <= 0 ||
          (p.tp - bars[state.index].close) * p.side <= 0 ||
          (bars[state.index].contract || null) !== p.contract)
      )
        fail();
      if (closed) {
        const exit = weighted / p.initialQty;
        if (
          p.symbol !== symbol ||
          p.remainingQty !== 0 ||
          !p.exits.length ||
          p.exitTime !== lastTime ||
          !near(p.exit, exit) ||
          !near(p.points, (exit - p.entry) * p.side) ||
          !near(p.gross, gross) ||
          !near(p.fees, fees) ||
          !near(p.pnl, net) ||
          !near(p.r, net / p.initialRisk) ||
          p.reason !== p.exits.at(-1).reason ||
          p.ambiguous !== p.exits.some((e: any) => e.ambiguous)
        )
          fail();
      }
      return { entry: p.time, exit: lastTime };
    };
    let previousExit = 0;
    for (const t of state.trades) {
      const span = checkPosition(t, true);
      if (t.queuedTime < previousExit || span.entry < previousExit) fail();
      previousExit = span.exit;
    }
    if (state.position !== null) {
      if (!state.position || state.pending !== null) fail();
      const span = checkPosition(state.position, false);
      if (state.position.queuedTime < previousExit || span.entry < previousExit)
        fail();
    }
    if (state.pending !== null) {
      if (!state.pending || state.position !== null) fail();
      if (state.pending.entryAtClose !== undefined) fail();
      checkQueued(state.pending);
      checkOrderHistory(state.pending);
      if (seen.has(state.pending.id) || state.pending.queuedTime < previousExit)
        fail();
    }
    if (state.closePending) {
      if (
        !state.position ||
        state.index >= bars.length - 1 ||
        (state.closeQty !== null &&
          !integer(state.closeQty, 1, state.position.qty))
      )
        fail();
    } else if (state.closeQty !== null) fail();
    // Construct only after every field has been validated. Clone the imported
    // state so later caller changes cannot mutate the running session.
    const replay = new Replay(bars, symbol),
      saved = copy(state);
    replay.index = saved.index;
    replay.position = saved.position;
    replay.pending = saved.pending;
    replay.closePending = saved.closePending;
    replay.closeQty = saved.closeQty;
    replay.trades = saved.trades;
    return replay;
  }

  bars: Bar[];
  symbol: Instrument;
  index: number;
  position: Position | null;
  pending: PendingOrder | null;
  closePending: boolean;
  closeQty: number | null;
  trades: Trade[];
  private _signature: string;
}
