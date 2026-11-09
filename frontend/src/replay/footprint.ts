import {
  contracts,
  footprint,
  TradeTape,
  seconds,
  type TradeEvent,
  type Instrument,
  type FootprintCandle,
} from "@eazy-trading/orderflow";
import { barTime, isRegularSession } from "./settings-model";
interface Context {
  symbol: Instrument;
  minutes: number;
  clockNs: string;
  events?: TradeEvent[];
  session: string;
  scope: string;
}
export function createFootprint({
  chart,
  series,
  volume,
  container,
  getContext,
  pause,
  restore,
  onClock,
  onSourceChange,
  onProjection,
}: any) {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;
  const canvas = document.createElement("canvas");
  canvas.className = "footprint-overlay";
  canvas.setAttribute(
    "aria-label",
    "Order flow footprint: sell initiated left, buy initiated right",
  );
  container.append(canvas);
  const notice = document.createElement("div");
  notice.className = "footprint-notice";
  container.append(notice);
  let mode = "candles",
    source = "replay",
    tape = new TradeTape(),
    cursor = 0,
    epoch = "",
    polling = false,
    candles: FootprintCandle[] = [],
    saved: any,
    frame = 0,
    closed = false,
    scope = "",
    feedContracts: Record<string, string> = {},
    gap = "";
  let savedColors: any;
  series.applyOptions({
    autoscaleInfoProvider: (original: any) => {
      const info = original();
      if (!info || mode !== "footprint") return info;
      const ctx = currentContext();
      if (!ctx) return info;
      const step =
        contracts[ctx.symbol as Instrument].tick *
        Number(el("footprintGrouping").value);
      return {
        ...info,
        priceRange: {
          minValue:
            Math.floor(info.priceRange.minValue / step) * step - step * 0.25,
          maxValue:
            Math.ceil(info.priceRange.maxValue / step) * step + step * 0.25,
        },
      };
    },
  });
  function currentContext(): Context | null {
    const ctx = getContext();
    return ctx && source !== "replay"
      ? { ...ctx, symbol: el("symbol").value as Instrument }
      : ctx;
  }
  function style() {
    if (mode === "footprint") {
      savedColors ||= series.options();
      series.applyOptions({
        upColor: "transparent",
        downColor: "transparent",
        wickUpColor: "transparent",
        wickDownColor: "transparent",
        borderUpColor: "transparent",
        borderDownColor: "transparent",
        priceLineVisible: false,
      });
    } else if (savedColors) {
      series.applyOptions(savedColors);
      savedColors = null;
    }
    canvas.hidden = mode !== "footprint";
    el("footprintGrouping").hidden = mode !== "footprint";
  }
  function render() {
    const ctx: Context = currentContext();
    if (!ctx) return;
    el("feedClock").textContent =
      source === "replay"
        ? ""
        : new Date(
            seconds(tape.all().at(-1)?.timeNs || "0") * 1000,
          ).toISOString();
    if (ctx.scope !== scope) {
      scope = ctx.scope;
      if (source === "replay") el("tradeClock").value = "0";
    }
    const events = source === "replay" ? ctx.events || [] : tape.all();
    const cutoff =
      source === "replay" ? ctx.clockNs : events.at(-1)?.timeNs || "0";
    candles = footprint(
      ctx.session === "rth"
        ? events.filter((e) => isRegularSession(seconds(e.timeNs)))
        : events,
      ctx.symbol,
      cutoff,
      ctx.minutes,
      Number(el("footprintGrouping").value),
      (s, m) => barTime(s, m, ctx.session),
    );
    // An exact-contract roll cannot share one chart time: show the last contract at that time,
    // while the canonical aggregator keeps both contracts distinct.
    const byTime = new Map<number, FootprintCandle>();
    for (const c of candles) byTime.set(c.time, c);
    candles = [...byTime.values()];
    if (source !== "replay" || ctx.events?.length) {
      onProjection(candles);
      series.setData(
        candles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      volume.setData(
        candles.map((c) => ({
          time: c.time,
          value: c.volume,
          color: "#8b75ff44",
        })),
      );
    }
    if (source !== "replay" || ctx.events?.length) {
      const last = candles.at(-1);
      el("primaryChartTitle").textContent =
        ctx.symbol + " · " + ctx.minutes + "m";
      el("contractName").textContent =
        last?.contract || feedContracts[ctx.symbol] || ctx.symbol;
      el("lastPrice").textContent = last ? last.close.toFixed(2) : "—";
      el("ohlc").textContent = last
        ? `O ${last.open.toFixed(2)} H ${last.high.toFixed(2)} L ${last.low.toFixed(2)} C ${last.close.toFixed(2)} V ${last.volume} Δ ${last.delta}`
        : "No trades at this clock";
    }
    el("tradeClock").disabled = source !== "replay" || !ctx.events?.length;
    const inspect = source === "replay" && ctx.events?.length;
    el("tradeClockWrap").hidden = !inspect;
    el("tradeClockLabel").textContent = inspect
      ? new Date(seconds(cutoff) * 1000).toISOString()
      : "";
    style();
    schedule();
  }
  function schedule() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
  }
  function draw() {
    const ctx: Context = currentContext();
    if (!ctx || mode !== "footprint") {
      notice.hidden = true;
      return;
    }
    const width = container.clientWidth,
      height = container.clientHeight,
      dpr = devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    g.font = "11px monospace";
    notice.hidden = false;
    notice.textContent =
      gap ||
      (!candles.length
        ? ctx.events?.length || source !== "replay"
          ? "No trades at this clock"
          : "Tick trade data required"
        : "Sell ← price → Buy · V includes unknown · Δ = buy − sell");
    const range = chart.timeScale().getVisibleLogicalRange();
    const span = range ? range.to - range.from : 90;
    const cellWidth = Math.max(2, Math.min(180, ((width - 75) / span) * 0.88));
    for (const c of candles) {
      const x = chart.timeScale().timeToCoordinate(c.time);
      if (x === null || x < -cellWidth || x > width) continue;
      const hi = series.priceToCoordinate(c.high),
        lo = series.priceToCoordinate(c.low);
      if (hi === null || lo === null) continue;
      g.strokeStyle = c.close >= c.open ? "#36c8a6" : "#f47d91";
      g.strokeRect(
        x - cellWidth / 2,
        hi - 5,
        cellWidth,
        Math.max(16, lo - hi + 10),
      );
      for (const row of c.rows) {
        const y = series.priceToCoordinate(row.price);
        if (y === null || y < 20 || y > height - 35) continue;
        g.fillStyle =
          row.delta >= 0 ? "rgba(35,174,141,.25)" : "rgba(230,88,113,.25)";
        const nextY = series.priceToCoordinate(
          row.price +
            Number(el("footprintGrouping").value) * contracts[ctx.symbol].tick,
        );
        const rowHeight =
          nextY === null ? 14 : Math.max(2, Math.min(28, Math.abs(nextY - y)));
        g.fillRect(x - cellWidth / 2, y - rowHeight / 2, cellWidth, rowHeight);
        if (cellWidth >= 44 && rowHeight >= 10) {
          g.textAlign = "right";
          g.fillStyle = "#ff93a8";
          g.fillText(String(row.sell), x - (cellWidth >= 120 ? 35 : 4), y + 4);
          g.textAlign = "left";
          g.fillStyle = "#56dfbe";
          g.fillText(String(row.buy), x + (cellWidth >= 120 ? 35 : 4), y + 4);
          if (cellWidth >= 120) {
            g.textAlign = "center";
            g.fillStyle = "#e2dfed";
            g.fillText(row.price.toFixed(2), x, y + 4);
          }
        }
      }
      if (cellWidth >= 44) {
        g.textAlign = "center";
        g.fillStyle = "#e2dfed";
        g.fillText(
          "V " + c.volume + "  Δ " + c.delta,
          x,
          Math.min(height - 40, lo + 24),
        );
      }
    }
    if (candles.length && cellWidth < 44) {
      notice.textContent += " · Zoom in to read volumes";
    }
    const last = candles.at(-1);
    const summary = el("footprintSummary");
    summary.textContent = last
      ? `${last.contract} · V ${last.volume} · Δ ${last.delta}`
      : "Tick trade data required";
    canvas.dataset.volume = String(last?.volume || 0);
    canvas.dataset.delta = String(last?.delta || 0);
  }
  async function poll() {
    if (closed || source === "replay" || polling) return;
    polling = true;
    const requestedSource = source;
    try {
      const response = await fetch(
        `/api/orderflow/stream?source=${source}&after=${cursor}&epoch=${encodeURIComponent(epoch)}`,
      );
      if (!response.ok) throw Error();
      const data = await response.json();
      if (source !== requestedSource) return;
      if (data.reset) {
        tape = new TradeTape();
        cursor = 0;
      }
      for (const t of data.events) tape.add(t);
      cursor = data.cursor;
      epoch = data.epoch;
      feedContracts = data.contracts;
      gap = data.gaps.length ? "Data gap: " + data.gaps.at(-1).message : "";
      el("feedStatus").textContent =
        `${data.label} · ${data.state}${gap ? " · GAP" : ""}`;
      el("feedStatus").dataset.state = data.state;
      render();
    } catch {
      el("feedStatus").textContent =
        (source === "demo" ? "Demo" : "Databento") + " · interrupted";
    } finally {
      polling = false;
    }
  }
  el("chartDisplay").onchange = () => {
    mode = el("chartDisplay").value;
    style();
    render();
  };
  el("footprintGrouping").onchange = render;
  el("tradeClock").oninput = () => {
    onClock(Number(el("tradeClock").value));
    render();
  };
  el("orderflowSource").onchange = () => {
    pause();
    if (source === "replay")
      saved = {
        range: chart.timeScale().getVisibleLogicalRange(),
        colors: series.options(),
      };
    source = el("orderflowSource").value;
    document.body.dataset.orderflowSource = source;
    if (source === "replay") el("symbol").value = getContext()?.symbol || "NQ";
    const drawingToolbar = document.querySelector(
      ".drawing-toolbar",
    ) as HTMLElement;
    if (drawingToolbar) drawingToolbar.inert = source !== "replay";
    onSourceChange(source);
    const orderCard = document.querySelector(".order-card") as HTMLElement;
    if (orderCard) orderCard.inert = source !== "replay";
    tape = new TradeTape();
    cursor = 0;
    epoch = "";
    gap = "";
    for (const id of ["play", "step", "long", "short"])
      el(id).disabled = source !== "replay";
    el("demoDisconnect").hidden = source !== "demo";
    el("feedStatus").textContent =
      source === "replay" ? "Replay" : source + " · connecting";
    if (source === "replay") {
      restore();
      if (saved?.range) chart.timeScale().setVisibleLogicalRange(saved.range);
      render();
    } else {
      series.setData([]);
      volume.setData([]);
      void poll();
    }
  };
  el("demoDisconnect").onclick = async () => {
    await fetch("/api/orderflow/demo/disconnect", { method: "POST" });
    void poll();
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
  const observer = new ResizeObserver(schedule);
  observer.observe(container);
  const tick = setInterval(() => {
    void poll();
  }, 500);
  // Price-scale changes (including drag/zoom) don't have a public subscription.
  const redraw = setInterval(schedule, 150);
  return {
    refresh: render,
    isStreaming: () => source !== "replay",
    destroy() {
      closed = true;
      clearInterval(tick);
      clearInterval(redraw);
      observer.disconnect();
      cancelAnimationFrame(frame);
      canvas.remove();
      notice.remove();
    },
  };
}
