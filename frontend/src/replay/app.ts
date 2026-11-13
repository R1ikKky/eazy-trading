import { t as translate, locale } from "../i18n/language";
import { confirmRewind } from "./rewind-dialog";
import { createEntryControl } from "./entry-control";
import { installProtectionDrag } from "./protection-drag";
import { createTradeHistory } from "./trade-history";
import { createDrawingWorkspace } from "./drawing-workspace";
import { installPaneInstrumentMenu } from "./pane-instruments";
import { installChartSplitter } from "./chart-splitter";
import { installSessionJump } from "./session-jump";
import {
  nextSessionOpening,
  advanceReplayToOpening,
  type SessionOpening,
} from "./session-openings";
import { createFootprint } from "./footprint";
import { ACCOUNT_DEPOSITS } from "./account-deposits";
import type { Instrument } from "./types";
import { element as $ } from "./dom";
import { importArchive } from "./archive";
import { contracts, demo, aggregate, parseCSV, Replay, dayKey } from "./engine";
import { marketData } from "./market-data";
import { curatedArchives, isCuratedDataset } from "./curated-data";
import {
  historyChoices,
  commonHistoryWindows,
  selectHistory,
  selectHistories,
  selectReplayBars,
} from "./history-selection";
import { createChartTools, loadSettings } from "./chart-tools";
import { isRegularSession, barTime } from "./settings-model";
import { createProduct } from "./product";
import { renderPosition, createComparison } from "./terminal";

const money = (v: any) =>
  (v < 0 ? "−" : "") +
  "$" +
  Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const price = (v: any) => {
  const precision: any = tools?.preferences.precision || "default",
    digits = precision === "default" ? 2 : Number(precision);
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
const nyTime = new Intl.DateTimeFormat(locale(), {
  timeZone: "America/New_York",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const nyClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
let displayTime = nyTime,
  displayZone = "ET",
  product: any,
  comparison: any,
  comparisonContext: any,
  comparisonHistory: any,
  comparisonEntryControl: any,
  entryControl: any,
  comparisonPriceLines: any[] = [],
  drawingWorkspace: any,
  paneSymbols: { primary: string; comparison: string } = {
    primary: "NQ",
    comparison: "ES",
  },
  setupPrimarySymbol = "NQ",
  setupPreferredId = "",
  setupToken = 0,
  settingUp = false,
  importing = false;
function chartPreferenceChanged(p: any) {
  product?.preferencesChanged(p);
  comparison?.render();
  displayTime = new Intl.DateTimeFormat(locale(), {
    timeZone: p.timezone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: p.hoursFormat === "12",
  });
  displayZone =
    p.timezone === "America/New_York"
      ? "ET"
      : p.timezone === "Europe/Moscow"
        ? "MSK"
        : p.timezone === "UTC"
          ? "UTC"
          : new Intl.DateTimeFormat("en-US", {
              timeZone: p.timezone,
              timeZoneName: "short",
            })
              .formatToParts(new Date())
              .find((x) => x.type === "timeZoneName").value;
  $("journalZone").textContent = "ET";
  if (replay) {
    if (lastChartSession !== p.session) {
      lastChartSession = p.session;
      rebuildChart();
    }
    render();
  }
}
const dateText = (s: any) =>
  new Date(s + "T12:00:00Z").toLocaleDateString(locale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const datasets: any = Object.fromEntries(
  Object.entries<any>(marketData).map(([s, data]) => [
    s,
    {
      bars: data.rows.map(
        ([time, open, high, low, close, volume, contract]) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
          contract,
        }),
      ),
      isDemo: false,
      source: "hf_market_data",
      name: "FirstRate Data via HF Market Data · " + s,
      metadata: data.metadata,
    },
  ]),
);
for (const [key, d] of Object.entries<any>(datasets)) {
  d.days = d.bars.map((b) => dayKey(b.time));
  d.id = "builtin-" + key + "-2024-01";
}
const datasetMap = new Map<string, any>(
  Object.values<any>(datasets).map((d) => [d.id, d]),
);
let symbol: any = "NQ",
  tf: any = 1,
  replay: any,
  context = [],
  from = "2024-01-08",
  to: any = "2024-01-12",
  timer: any = null,
  chart: any,
  series: any,
  volume: any,
  tradeHistory: any,
  priceLines: any = [],
  renderedLevelsSignature = "",
  protectionPreview: {kind: "sl" | "tp"; price: number; id: string} | null = null,
  chartBars = [],
  toastTimer,
  tools: any,
  historyController,
  orderflow: any,
  tradeOffset = 0,
  activeSession: any = loadSettings().session,
  lastChartSession = activeSession;
function toast(message: any) {
  $("toast").textContent = translate(String(message));
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}
function guard(action: any) {
  try {
    return action();
  } catch (e) {
    toast(e.message);
    return false;
  }
}
window.addEventListener("language-will-change", () => pause());
function pause() {
  if (timer) clearInterval(timer);
  timer = null;
  syncPlayback();
}
function syncPlayback() {
  if (!replay) return;
  $("playIcon").textContent = timer ? "Ⅱ" : "▶";
  $("playLabel").textContent = timer ? translate("Пауза") : translate("Пуск");
  $("play").setAttribute("aria-pressed", String(Boolean(timer)));
  $("play").setAttribute(
    "aria-label",
    timer ? translate("Пауза") : translate("Воспроизвести"),
  );
  $("chartStatus").textContent = replay.ended
    ? translate("ЗАВЕРШЕНО")
    : timer
      ? "REPLAY"
      : translate("ПАУЗА");
  $("play").disabled = replay.ended || !chart;
  $("step").disabled = replay.ended || !chart;
  $("back").disabled = !chart || replay.index === 0 || !!orderflow?.isStreaming();
  $("back").title = translate("Предыдущая свеча");
}
function togglePlay() {
  if (orderflow?.isStreaming()) return;
  if (!chart || !replay || replay.ended) return;
  if (timer) {
    pause();
    return;
  }
  tools?.freezeViewport();
  comparison?.freezeViewport();
  timer = setInterval(step, Number($("speed").value));
  syncPlayback();
}
function primaryInstrument() {
  return paneSymbols.primary;
}
function positionLevels(instrument: string) {
  const p = replay?.position;
  return p && instrument === symbol ? [p.entry, p.sl, p.tp] : [];
}
function syncPaneToolbar() {
  const interval =
    drawingWorkspace?.activeId === "comparison"
      ? comparison?.getTimeframe() || tf
      : tf;
  for (const button of document.querySelectorAll<HTMLElement>("[data-tf]")) {
    const selected = Number(button.dataset.tf) === interval;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}
function savePanePreferences() {
  try {
    localStorage.setItem(
      "eazy-trading-chart-panels:" + product.active().id,
      JSON.stringify(paneSymbols),
    );
  } catch {}
}
async function choosePaneInstrument(
  pane: "primary" | "comparison",
  next: string,
) {
  if (!["NQ", "ES"].includes(next) || paneSymbols[pane] === next) return;
  const session = product.active(),
    scope = session?.id,
    rangeFrom = from,
    rangeTo = to;
  const id =
    next === session?.symbol ? session.datasetId : session?.comparisonDatasetId;
  const data = id
    ? await loadHistoryById(id, rangeFrom, rangeTo)
    : await loadHistory(next, rangeFrom, rangeTo);
  assertDatasetSymbol(data, id || data.id, next);
  if (product.active()?.id !== scope || from !== rangeFrom || to !== rangeTo)
    return;
  datasets[next] = data;
  paneSymbols[pane] = next;
  pause();
  drawingWorkspace.cancel();
  if (pane === "primary") rebuildChart();
  else comparison.render();
  render(false);
  drawingWorkspace.refresh();
  savePanePreferences();
}
function initChart() {
  const L = window.LightweightCharts;
  if (!L) throw Error(translate("Библиотека графика не загрузилась."));
  chart = L.createChart($("chart"), {
    autoSize: true,
    layout: {
      background: { type: L.ColorType.Solid, color: "#ffffff" },
      textColor: "#829075",
      fontFamily: "IBM Plex Mono, monospace",
      fontSize: 12,
      attributionLogo: true,
    },
    grid: { vertLines: { color: "#f0f3eb" }, horzLines: { color: "#eef2e9" } },
    rightPriceScale: {
      borderColor: "#eaf0e1",
      scaleMargins: { top: 0.12, bottom: 0.23 },
    },
    timeScale: {
      borderColor: "#eaf0e1",
      timeVisible: true,
      shiftVisibleRangeOnNewBar: false,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
      tickMarkFormatter: (t) => nyClock.format(new Date(t * 1000)),
    },
    localization: {
      locale: locale(),
      timeFormatter: (t) => nyTime.format(new Date(t * 1000)) + " ET",
    },
    crosshair: {
      mode: L.CrosshairMode.Normal,
      vertLine: { color: "#adbba0", labelBackgroundColor: "#3c4d32" },
      horzLine: { color: "#adbba0", labelBackgroundColor: "#3c4d32" },
    },
  });
  series = chart.addSeries(L.CandlestickSeries, {
    upColor: "#2c967c",
    downColor: "#db7471",
    borderVisible: false,
    wickUpColor: "#2c967c",
    wickDownColor: "#db7471",
    priceFormat: { type: "price", precision: 2, minMove: 0.25 },
    priceLineColor: "#769561",
    lastValueVisible: true,
  });
  volume = chart.addSeries(L.HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "",
    lastValueVisible: false,
    priceLineVisible: false,
  });
  volume.priceScale().applyOptions({ scaleMargins: { top: 0.87, bottom: 0 } });
  tradeHistory = createTradeHistory(series);
  drawingWorkspace = createDrawingWorkspace({
    getPreferences: () => tools?.preferences || loadSettings(),
    getNow: () => replay?.current.time || 0,
    getScope: () => product?.active()?.id || "loading",
    getSessionSymbol: () => symbol,
    getCapital: () => product?.active()?.capital || 50000,
    onDrawingsChange: (value: any) => product?.saveDrawings(value),
    onChange: chartPreferenceChanged,
    pause,
    toast,
    onActiveChange: () => syncPaneToolbar(),
  });
  tools = createChartTools({
    chart,
    series,
    volume,
    container: $("chart"),
    getBars: () => chartBars,
    drawingWorkspace,
    getSymbol: primaryInstrument,
    getPriceLevels: () => positionLevels(primaryInstrument()),
    getTimeframe: () => tf,
    getNow: () => replay?.current.time || 0,
    getScope: () => product?.active()?.id || "loading",
    onDrawingsChange: (drawings) => product?.saveDrawings(drawings),
    onChange: chartPreferenceChanged,
    onSessionCommit: (next) => {
      try {
        selectBars(symbol, from, to, next);
        if (!canReset()) return false;
        startSession(symbol, from, to, next);
        return true;
      } catch (e) {
        toast(e.message);
        return false;
      }
    },
    toast,
    pause,
  });
  installPositionDragging("primary", chart, series, $("chart"));
  entryControl = installEntryControl("primary", chart, series, $("chart"));
  chart.subscribeCrosshairMove((param) => {
    const b: any = tools?.lockedTime
      ? chartBars.find((b) => b.time === tools.lockedTime)
      : param.seriesData?.get(series);
    if (b?.close) showOhlc(b);
    else if (replay) showOhlc(chartBars.at(-1));
  });
  orderflow = createFootprint({
    getPriceLevels: () => positionLevels(primaryInstrument()),
    chart,
    series,
    volume,
    container: $("chart"),
    pause,
    getContext: () =>
      replay
        ? {
            symbol,
            minutes: tf,
            clockNs: (
              BigInt(replay.current.time) * 1000000000n +
              BigInt(tradeOffset) * 1000000n
            ).toString(),
            events: datasets[symbol]?.metadata?.tradeEvents,
            session: tools?.preferences.session || "all",
            scope: product?.active()?.id || "",
          }
        : null,
    onProjection: (candles: any[]) => {
      chartBars = candles.map((c) => ({ ...c }));
      tools?.refresh();
    },
    onSourceChange: (source: string) =>
      comparison?.setVisible(
        source === "replay" && Boolean(product?.active()?.comparisonDatasetId),
      ),
    onClock: (offset: number) => {
      tradeOffset = offset;
    },
    restore: () => {
      rebuildChart();
      render();
    },
  });
}

function showOhlc(b: any) {
  if (datasets[symbol]?.metadata?.tradeEvents || orderflow?.isStreaming())
    return;
  if (!b) return;
  b = chartBars.find((x) => x.time === b.time) || b;
  $("ohlc").textContent =
    "O " +
    price(b.open) +
    "   H " +
    price(b.high) +
    "   L " +
    price(b.low) +
    "   C " +
    price(b.close);
  tools?.updateLegend(b);
}
function volBar(b: any) {
  return {
    time: b.time,
    value: b.volume || 0,
    color: b.close >= b.open ? "#2c967c28" : "#db747128",
  };
}
function rebuildChart(leftTime: any = null, preserve = false) {
  const prior = preserve ? chart?.timeScale().getVisibleLogicalRange() : null;
  const previousBars = chartBars;
  if (!chart) return;
  if (!preserve) tools?.releaseViewport();
  chartBars = aggregate(
    (primaryInstrument() === symbol
      ? [...context, ...replay.bars.slice(0, replay.index + 1)]
      : (datasets[primaryInstrument()]?.bars || [])
          .filter((b) => b.time <= replay.current.time)
          .slice(-30000)
    ).filter(
      (b) => tools?.preferences.session !== "rth" || isRegularSession(b.time),
    ),
    tf,
    (time, m) => barTime(time, m, tools?.preferences.session || activeSession),
  );
  series.setData(chartBars);
  volume.setData(chartBars.map(volBar));
  tools?.refresh();
  const right: any = tools?.preferences.marginRight ?? 10;
  if (prior) {
    const dropped =
      chartBars[0] && previousBars[0] && chartBars[0].time > previousBars[0].time
        ? previousBars.findIndex((bar) => bar.time >= chartBars[0].time)
        : 0;
    const restored = chartBars[0] && previousBars[0] && chartBars[0].time < previousBars[0].time
      ? chartBars.findIndex((bar) => bar.time >= previousBars[0].time) : 0;
    const shift = Math.max(0, restored) - Math.max(0, dropped);
    chart.timeScale().setVisibleLogicalRange({
      from: prior.from + shift,
      to: prior.to + shift,
    });
    return;
  }
  if (leftTime !== null && tools?.preferences.saveLeftEdge) {
    const index = chartBars.findIndex((b) => b.time >= leftTime);
    if (index >= 0) {
      const span = Math.max(
        20,
        ($("chart").clientWidth - 60) / (tools.preferences.barSpacing || 8),
      );
      chart
        .timeScale()
        .setVisibleLogicalRange({ from: index, to: index + span });
      return;
    }
  }
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(-3, chartBars.length - 90),
    to: chartBars.length + right,
  });
}
function appendBar(b: any) {
  if (primaryInstrument() !== symbol) {
    rebuildChart(null, true);
    return;
  }
  if (tools?.preferences.session === "rth" && !isRegularSession(b.time)) return;
  const t: any = barTime(
    b.time,
    tf,
    tools?.preferences.session || activeSession,
  );
  let last = chartBars.at(-1);
  if (last?.time === t) {
    last = {
      ...last,
      high: Math.max(last.high, b.high),
      low: Math.min(last.low, b.low),
      close: b.close,
      volume: last.volume + b.volume,
    };
    chartBars[chartBars.length - 1] = last;
  } else {
    last = { ...b, time: t };
    chartBars.push(last);
  }
  if (chart) {
    const viewport = chart.timeScale().getVisibleLogicalRange();
    series.update(last);
    volume.update(volBar(last));
    tools?.refresh();
    if (viewport) chart.timeScale().setVisibleLogicalRange(viewport);
  }
}
function hasWork() {
  return !!(
    replay &&
    (replay.trades.length || replay.position || replay.pending)
  );
}
function canReset() {
  pause();
  if (replay) product?.saveReplay(replay.snapshot());
  return true;
}
function selectBars(s: any, a: any, b: any, session = activeSession) {
  return selectReplayBars(datasets[s], a, b, session);
}
function startSession(
  s: any,
  a: any,
  b: any,
  session = activeSession,
  options: any = {},
) {
  const selected = selectBars(s, a, b, session),
    comparisonDatasetId: any =
      options.comparisonDatasetId ??
      (options.record
        ? options.record.comparisonDatasetId || ""
        : product?.active()?.comparisonDatasetId || "");
  const nextReplay: any =
    options.record && !options.rerun
      ? Replay.restore(selected.bars, s, options.record.snapshot)
      : new Replay(selected.bars, s);
  if (replay && !options.discardCurrent) product?.saveReplay(replay.snapshot());
  activeSession = session;
  pause();
  comparison?.resetViewport();
  tools?.cancel();
  symbol = s;
  paneSymbols = { primary: s, comparison: s === "NQ" ? "ES" : "NQ" };
  from = a;
  to = b;
  context = selected.context;
  replay = nextReplay;
  tradeOffset = 0;
  if (options.record && !options.rerun) product.resumed(options.record.id);
  else
    product?.createSession({
      symbol: s,
      from: a,
      to: b,
      session,
      datasetId: datasets[s].id,
      comparisonDatasetId,
      source: datasets[s].source,
      snapshot: replay.snapshot(),
      name:
        options.name ||
        (options.record
          ? options.record.name + translate(" · повтор")
          : s + " · " + a),
      capital: options.capital || options.record?.capital || 50000,
      strategyId: options.strategyId || options.record?.strategyId || "",
    });
  try {
    const saved = JSON.parse(
      localStorage.getItem(
        "eazy-trading-chart-panels:" + product.active().id,
      ) || "null",
    );
    for (const pane of ["primary", "comparison"] as const)
      if (["NQ", "ES"].includes(saved?.[pane])) paneSymbols[pane] = saved[pane];
  } catch {}
  $("symbol").value = symbol;
  $("contractName").textContent = contracts[symbol].name;
  $("rangeLabel").textContent = dateText(from) + " — " + dateText(to);
  $("tickInfo").textContent =
    translate("1 тик = ") + money(contracts[symbol].point * 0.25);
  if (tools && tools.preferences.session !== session) {
    lastChartSession = session;
    tools.updatePreferences({ session });
  }
  tools?.restoreDrawings(product?.active()?.drawings || []);
  rebuildChart();
  render();
  comparison?.setVisible(Boolean(comparisonDatasetId));
}
async function activateRecord(
  record: any,
  rerun = false,
  discardCurrent = false,
) {
  if (!record) throw Error(translate("Сессия не найдена"));
  pause();
  let d = datasetMap.get(record.datasetId);
  if (d?.archive) d = null;
  if (!d) {
    d = await product.readDataset(record.datasetId, {
      from: record.from,
      to: record.to,
    });
    d.days = d.bars.map((b) => dayKey(b.time));
    d.isDemo = false;
    datasetMap.set(record.datasetId, d);
  }
  const other = record.symbol === "NQ" ? "ES" : "NQ";
  let otherData = record.comparisonDatasetId
    ? await loadHistoryById(record.comparisonDatasetId, record.from, record.to)
    : null;
  if (!otherData) {
    try {
      const savedViews = JSON.parse(
        localStorage.getItem("eazy-trading-chart-panels:" + record.id) ||
          "null",
      );
      if (
        savedViews?.primary === other ||
        savedViews?.comparison === record.symbol
      )
        otherData = await loadHistory(other, record.from, record.to);
    } catch (error) {
      toast(error.message);
    }
  }
  if (otherData) {
    assertDatasetSymbol(
      otherData,
      record.comparisonDatasetId || otherData.id,
      other,
    );
    selectReplayBars(otherData, record.from, record.to, record.session);
  }
  const old = datasets[record.symbol],
    oldOther = datasets[other];
  datasets[record.symbol] = d;
  if (otherData) datasets[other] = otherData;
  try {
    startSession(record.symbol, record.from, record.to, record.session, {
      record,
      rerun,
      discardCurrent,
    });
  } catch (e) {
    datasets[record.symbol] = old;
    if (otherData) datasets[other] = oldOther;
    throw e;
  }
}
function assertDatasetSymbol(data: any, id: any, expected: any) {
  const actual =
    data.symbol || product.store.value.settings.datasets?.[id]?.symbol;
  if (actual !== expected)
    throw Error(
      translate("История второго инструмента не соответствует ") + expected,
    );
}
async function loadHistoryById(id: any, a: any, b: any) {
  let d = datasetMap.get(id);
  if (
    !d ||
    (d.archive &&
      (!d.loadedRange || a < d.loadedRange.from || b > d.loadedRange.to))
  )
    d = await product.readDataset(id, { from: a, to: b });
  d.days ||= d.bars.map((bar) => dayKey(bar.time));
  d.isDemo = false;
  datasetMap.set(id, d);
  return d;
}
async function loadHistory(next: any, a: any, b: any, preferredId?: any) {
  const entry = selectHistory(
    product.store.value.settings.datasets,
    next,
    a,
    b,
    preferredId,
  );
  return loadHistoryById(entry.id, a, b);
}
async function openDataset(id: any) {
  if (["NQ", "ES"].includes(id)) {
    openSetup(id);
    return;
  }
  const entry = product.store.value.settings.datasets?.[id];
  if (!entry) throw Error(translate("Исторические данные не найдены"));
  openSetup(entry.symbol, id);
}
async function loadComparisonData() {
  const main = symbol,
    a = from,
    b = to,
    other = main === "NQ" ? "ES" : "NQ",
    current: any = datasets[other],
    linkedId = product.active()?.comparisonDatasetId,
    range = current.loadedRange || {
      from: current.days[0],
      to: current.days.at(-1),
    };
  if (
    (!linkedId || current.id === linkedId) &&
    range.from <= a &&
    range.to >= b
  )
    return;
  const data = linkedId
    ? await loadHistoryById(linkedId, a, b)
    : await loadHistory(other, a, b);
  if (linkedId) assertDatasetSymbol(data, linkedId, other);
  if (main === symbol && a === from && b === to) datasets[other] = data;
}
function setupSymbols() {
  return ["NQ", "ES"].filter((next) => $("session" + next).checked);
}
function setupPrimary() {
  const selected = setupSymbols();
  return selected.includes(setupPrimarySymbol)
    ? setupPrimarySymbol
    : selected[0];
}
function setupAvailability(reset = false) {
  const selected: any = setupSymbols(),
    next = setupPrimary(),
    records = product.store.value.settings.datasets,
    windows = commonHistoryWindows(records, selected),
    first = windows[0]?.from,
    last = windows.at(-1)?.to;
  for (const id of ["fromDate", "toDate"]) {
    $(id).min = first || "";
    $(id).max = last || "";
  }
  for (const button of $("setupYears").querySelectorAll<HTMLElement>(
    "[data-setup-year]",
  ))
    (button as HTMLButtonElement).disabled = !windows.some(
      (w) =>
        w.from <= button.dataset.setupYear + "-12-31" &&
        w.to >= button.dataset.setupYear + "-01-01",
    );
  if (windows.length) {
    const keep = !reset && $("fromDate").value && $("toDate").value;
    if (!keep) {
      const preferred = historyChoices(records, next, setupPreferredId).find(
          (d) => d.id === setupPreferredId,
        ),
        window: any = preferred
          ? windows.find(
              (w) => w.from <= preferred.to && w.to >= preferred.from,
            ) || windows.at(-1)
          : windows.at(-1);
      let a, b;
      if (preferred) {
        a = preferred.from;
        const end = new Date(a + "T12:00:00Z");
        end.setUTCDate(end.getUTCDate() + 6);
        b = end.toISOString().slice(0, 10);
        if (b > preferred.to) b = preferred.to;
      } else {
        b = window.to;
        const start = new Date(b + "T12:00:00Z");
        start.setUTCDate(start.getUTCDate() - 6);
        a = start.toISOString().slice(0, 10);
        if (a < window.from) a = window.from;
        if (replay) {
          try {
            selectHistories(records, selected, from, to);
            a = from;
            b = to;
          } catch {}
        }
      }
      $("fromDate").value = a;
      $("toDate").value = b;
    }
  }
  previewRange();
}
function openSetup(next = symbol, preferredId = "") {
  pause();
  setupPrimarySymbol = next;
  setupPreferredId = preferredId;
  for (const instrument of ["NQ", "ES"])
    $("session" + instrument).checked = !preferredId || instrument === next;
  $("sessionName").value = "";
  $("sessionName").setCustomValidity("");
  const previousCapital = product?.active()?.capital;
  $("sessionCapital").value = String(
    ACCOUNT_DEPOSITS.some((amount) => amount === previousCapital)
      ? previousCapital
      : 50000,
  );
  $("sessionStrategy").innerHTML = product.options(
    product.active()?.strategyId || "",
  );
  setupAvailability(true);
  if (!$("setupDialog").open) $("setupDialog").showModal();
}
function openSource() {
  pause();
  const d = datasets[symbol],
    curated = isCuratedDataset(d.id),
    meta = d.metadata || {};
  $("sourceName").textContent = d.name || translate("Ваш CSV");
  $("sourceRange").textContent =
    nyTime.format(new Date(d.bars[0].time * 1000)) +
    " — " +
    nyTime.format(new Date(d.bars.at(-1).time * 1000)) +
    " ET · " +
    d.bars.length.toLocaleString(locale()) +
    translate(" свечей в загруженном диапазоне");
  $("providerNotes").hidden = d.source !== "hf_market_data";
  $("userSourceNote").hidden = d.source !== "user_csv";
  $("curatedSourceNotes").hidden = !curated;
  if (curated) {
    $("curatedSourceSummary").textContent = meta.note || "";
    $("curatedSourceDetails").textContent =
      translate("Источник: ") +
      meta.provider +
      translate(". Загрузка: ") +
      meta.retrievedAt +
      ". " +
      (meta.contracts?.length
        ? translate("Контракты / идентификаторы: ") +
          meta.contracts.join(", ") +
          ". "
        : translate("Контрактные коды не указаны. ")) +
      (meta.adjusted
        ? translate("Цены скорректированы источником. ")
        : translate("Цены сохранены как в исходном архиве. "));
    $("curatedSourceLink").href = meta.sourceUrl;
  }
  $("sourceContracts").textContent =
    translate("Контракты: ") +
    (meta.contracts?.join(", ") || translate("не указаны")) +
    translate(". Загружено: ") +
    (meta.fetchedAt
      ? new Date(meta.fetchedAt).toLocaleDateString(locale())
      : "—") +
    ".";
  $("sourceDialog").showModal();
}
function previewRange() {
  const button: any =
    $("setupForm").querySelector<HTMLElement>("[type=submit]");
  try {
    selectHistories(
      product.store.value.settings.datasets,
      setupSymbols(),
      $("fromDate").value,
      $("toDate").value,
      setupPreferredId,
    );
    $("setupError").textContent = "";
    button.disabled = settingUp;
  } catch (error) {
    $("setupError").textContent = error.message;
    button.disabled = true;
  }
}
function config() {
  return {
    qty: Number($("qty").value),
    stop: 0,
    target: 0,
    chartProtection: true as const,
    fee: Number($("fee").value),
    slip: Number($("slip").value),
    kind: $("orderKind").value,
    entryPrice:
      $("orderKind").value === "market" ? null : Number($("entryPrice").value),
  };
}
function riskPreview() {
  const p = replay?.position;
  const risk =
    p?.sl != null
      ? Math.max(
          0,
          (p.entry - p.sl) * p.side * contracts[symbol].point * p.qty +
            2 * p.fee * p.qty,
        )
      : null;
  $("riskValue").textContent = risk !== null ? money(risk) : "—";
  const stop = p?.sl != null ? Math.max(0, (p.entry - p.sl) * p.side) : 0;
  const target = p?.tp != null ? Math.max(0, (p.tp - p.entry) * p.side) : 0;
  $("rrValue").textContent =
    stop > 0 && target > 0 ? "1 : " + (target / stop).toFixed(1) : "—";
}
function order(side: any) {
  if (orderflow?.isStreaming())
    throw Error("Switch to Replay to simulate orders");
  if (!chart) throw Error(translate("Сначала загрузите график."));
  pause();
  const settings = config();
  tools?.releaseViewport();
  comparison?.releaseViewport();
  if (settings.kind === "market") replay.openMarket(side, settings);
  else replay.queue(side, settings);
  render();
  toast(
    (side === 1 ? "Long" : "Short") +
      " · " +
      config().kind.toUpperCase() +
      translate(" заявка создана"),
  );
}
let rewindPending = false;
async function rewindCandle() {
  if (
    rewindPending ||
    !replay ||
    replay.index === 0 ||
    orderflow?.isStreaming()
  )
    return;
  pause();
  rewindPending = true;
  const currentReplay = replay,
    currentIndex = replay.index;
  try {
    if (!replay.canRewind) {
      const clock = (time: number) =>
        displayTime.format(new Date(time * 1000)) + " " + displayZone;
      const accepted = await confirmRewind({
        from: clock(replay.current.time),
        to: clock(replay.bars[currentIndex - 1].time),
        description: translate(
          "В старой сессии не сохранено состояние сделок для этой свечи. Откройте отдельный чистый повтор с предыдущей свечи. Исходная сессия и её сделки останутся без изменений.",
        ),
        confirmLabel: translate("Открыть повтор"),
        changes: [
          {
            label: translate("Новый повтор без позиций и заявок"),
            detail: translate(
              "Исходная история сделок сохранится в разделе Сессии",
            ),
          },
        ],
      });
      if (
        !accepted ||
        replay !== currentReplay ||
        replay.index !== currentIndex
      )
        return;
      guard(() => {
        const original = product.active();
        const fork = replay.forkBeforeCurrent();
        product.saveReplay(replay.snapshot());
        const record = product.createSession({
          ...original,
          name: original.name.slice(0, 80) + translate(" · перемотка"),
          snapshot: fork.snapshot(),
        });
        record.drawings = structuredClone(
          (original.drawings || []).filter(
            (drawing) => drawing.createdAt <= fork.current.time,
          ),
        );
        record.notes = original.notes || "";
        startSession(record.symbol, record.from, record.to, record.session, {
          record,
          discardCurrent: true,
        });
      });
      return;
    }
    const names = {
      orders: "Заявки и позиции",
      protection: "Изменения SL/TP",
      trades: "Исполнения и результаты сделок",
      volume: "Частичные выходы",
      close: "Запросы на закрытие",
    };
    const effects = replay.rewindEffects();
    if (effects.length) {
      const previous = replay.rewindPreview();
      const changes = effects.map((effect) => ({
        label: translate(names[effect]),
        detail: "",
      }));
      if (
        effects.includes("protection") &&
        previous.position?.id === replay.position?.id
      ) {
        const value = (level: number | null) =>
          level == null ? translate("Не задано") : price(level);
        changes.find(
          (change) => change.label === translate(names.protection),
        ).detail = ["sl", "tp"]
          .filter((key) => replay.position[key] !== previous.position[key])
          .map(
            (key) =>
              `${key.toUpperCase()}: ${value(replay.position[key])} → ${value(previous.position[key])}`,
          )
          .join(" · ");
      }
      const clock = (time: number) =>
        displayTime.format(new Date(time * 1000)) + " " + displayZone;
      const accepted = await confirmRewind({
        from: clock(replay.current.time),
        to: clock(replay.bars[currentIndex - 1].time),
        changes,
      });
      if (
        !accepted ||
        replay !== currentReplay ||
        replay.index !== currentIndex
      )
        return;
    }
    guard(() => {
      tools?.cancel();
      protectionPreview = null;
      tools?.freezeViewport();
      comparison?.freezeViewport();
      replay.rewind();
      tradeOffset = 0;
      rebuildChart(null, true);
      render();
    });
  } finally {
    rewindPending = false;
  }
}
function step() {
  if (orderflow?.isStreaming()) return false;
  tradeOffset = 0;
  if (!replay || replay.ended) {
    pause();
    return false;
  }
  tools?.freezeViewport();
  comparison?.freezeViewport();
  const oldCount = replay.trades.length;
  replay.step();
  appendBar(replay.current);
  if (replay.trades.length > oldCount) {
    pause();
    const t = replay.trades.at(-1);
    toast(
      t.reason +
        " · " +
        money(t.pnl) +
        (t.ambiguous ? translate(" · SL и TP в одной свече") : ""),
    );
  }
  if (replay.ended) {
    pause();
    toast(
      replay.position
        ? translate(
            "Период завершён. Позиция остаётся открытой; её P&L не включён в статистику.",
          )
        : translate("Период завершён. Выберите новую сессию."),
    );
  }
  render();
  return true;
}
function skipToOpening(session: SessionOpening) {
  if (!replay || orderflow?.isStreaming()) return;
  pause();
  const target = nextSessionOpening(replay.bars, replay.index, session);
  if (target < 0) {
    toast(translate("Нет открытия в оставшихся данных"));
    return;
  }
  tools?.cancel();
  tradeOffset = 0;
  advanceReplayToOpening(replay, target);
  comparison?.resetViewport();
  rebuildChart();
  render();
  toast(
    translate(session.name) +
      " · " +
      displayTime.format(new Date(replay.current.time * 1000)) +
      " " +
      displayZone,
  );
}
function installEntryControl(
  id: string,
  targetChart: any,
  targetSeries: any,
  container: HTMLElement,
) {
  return createEntryControl({
    container,
    chart: targetChart,
    series: targetSeries,
    getState: () => {
      const p = replay?.position;
      if (
        !p ||
        (id === "primary" ? primaryInstrument() : paneSymbols.comparison) !== symbol
      ) return null;
      const cancel = replay.canCancelEntry;
      return {
        price: p.entry,
        label: translate("ВХОД"),
        action: translate(cancel ? "Отменить заявку" : "Закрыть"),
        mode: cancel ? "cancel" : "close",
        disabled: !!replay.closePending,
      };
    },
    onAction: () => guard(() => {
      pause();
      if (!replay?.position) return;
      if (replay.canCancelEntry) replay.cancelEntry();
      else replay.closeMarket();
      render();
    }),
  });
}
function installPositionDragging(
  id: string,
  targetChart: any,
  targetSeries: any,
  container: HTMLElement,
) {
  installProtectionDrag({
    container,
    chart: targetChart,
    series: targetSeries,
    getPosition: () => replay?.position || null,
    getCurrentPrice: () => replay?.current.close,
    canDrag: () =>
      !!replay?.position &&
      !orderflow?.isStreaming() &&
      (id === "primary" ? primaryInstrument() : paneSymbols.comparison) ===
        symbol &&
      drawingWorkspace.isNavigation(id),
    onStart: () => {
      pause();
      tools?.freezeViewport();
      comparison?.freezeViewport();
    },
    onPreview: (kind, value) => {
      protectionPreview = { kind, price: value, id: replay.position.id };
      renderLines();
    },
    onCommit: (kind, value) => {
      protectionPreview = null;
      guard(() => replay.modifyProtection({ [kind]: value }));
      render();
    },
    onCancel: () => {
      protectionPreview = null;
      renderLines();
    },
  });
}
function renderLines() {
  if (!series) return;
  for (const line of priceLines) series.removePriceLine(line);
  priceLines = [];
  if (comparisonContext)
    for (const line of comparisonPriceLines)
      comparisonContext.series.removePriceLine(line);
  comparisonPriceLines = [];
  const p = replay.position;
  const targets = [
    ...(primaryInstrument() === symbol ? [{ series, lines: priceLines }] : []),
    ...(comparisonContext &&
    comparison?.getVisible() &&
    paneSymbols.comparison === symbol
      ? [{ series: comparisonContext.series, lines: comparisonPriceLines }]
      : []),
  ];
  if (p)
    for (const target of targets)
      for (const [title, value, color] of [
        [translate("ВХОД"), p.entry, "#748b59"],
        [
          "SL",
          protectionPreview?.id === p.id && protectionPreview.kind === "sl"
            ? protectionPreview.price
            : p.sl,
          "#cf6c66",
        ],
        [
          "TP",
          protectionPreview?.id === p.id && protectionPreview.kind === "tp"
            ? protectionPreview.price
            : p.tp,
          "#2a967a",
        ],
      ]) {
        if (value == null) continue;
        target.lines.push(
          target.series.createPriceLine({
            price: value,
            color,
            lineWidth: title === translate("ВХОД") ? 2 : 1,
            lineStyle: title === translate("ВХОД") ? 0 : 2,
            axisLabelVisible: true,
            title: title === translate("ВХОД") ? "" : title,
          }),
        );
      }
  const levelsSignature = JSON.stringify([
    symbol,
    primaryInstrument(),
    paneSymbols.comparison,
    comparison?.getVisible(),
    p?.id,
    p?.entry,
    p?.sl,
    p?.tp,
  ]);
  if (levelsSignature !== renderedLevelsSignature) {
    renderedLevelsSignature = levelsSignature;
    // Price lines only repaint. Re-submit the unchanged, revealed last bar to
    // invalidate the scale cache without advancing time or altering history.
    if (chartBars.length) series.update(chartBars.at(-1));
    const comparisonBar = comparisonContext?.getBars().at(-1);
    if (comparisonBar && comparison?.getVisible())
      comparisonContext.series.update(comparisonBar);
  }
  entryControl?.refresh();
  comparisonEntryControl?.refresh();
  const showHistory = !tools?.preferences.hideMarks;
  tradeHistory.setHistory(
    primaryInstrument() === symbol && showHistory ? replay.trades : [],
    primaryInstrument() === symbol && showHistory ? p : null,
    (time: number) =>
      barTime(time, tf, tools?.preferences.session || activeSession),
  );
  comparisonHistory?.setHistory(
    paneSymbols.comparison === symbol && showHistory ? replay.trades : [],
    paneSymbols.comparison === symbol && showHistory ? p : null,
    (time: number) =>
      barTime(
        time,
        comparison?.getTimeframe() || tf,
        tools?.preferences.session || activeSession,
      ),
  );
}
function render(save = true) {
  $("primaryChartTitle").textContent = primaryInstrument() + " · " + tf + "m";
  $("orderInstrument").textContent = symbol;
  syncPaneToolbar();
  $("mainChartNotice").textContent =
    translate("Потяните от линии входа: к убытку — SL, к прибыли — TP");
  const b: any = replay.current,
    s = replay.stats();
  $("contractName").textContent = b.contract || contracts[symbol].name;
  $("lastPrice").textContent = chartBars.length
    ? price(chartBars.at(-1).close)
    : "—";
  showOhlc(chartBars.at(-1));
  $("netStat").textContent = money(s.net);
  $("netStat").className = s.net > 0 ? "positive" : s.net < 0 ? "negative" : "";
  $("replayTime").textContent =
    displayTime.format(new Date(b.time * 1000)) + " " + displayZone;
  $("progressLabel").textContent =
    translate("Свеча ") +
    (replay.index + 1) +
    translate(" из ") +
    replay.bars.length;
  $("progressBar").style.width =
    ((replay.index + 1) / replay.bars.length) * 100 + "%";
  const unavailable: any = !!(
    replay.position ||
    replay.pending ||
    replay.ended ||
    !chart
  );
  const configuredOrder = replay.position || replay.pending;
  if (configuredOrder) {
    for (const key of ["qty", "fee", "slip"])
      $(key).value = String(configuredOrder[key]);
    $("orderKind").value = configuredOrder.kind;
    if (configuredOrder.entryPrice !== null)
      $("entryPrice").value = String(configuredOrder.entryPrice);
  }
  syncOrderKind();
  $("long").disabled = unavailable;
  $("short").disabled = unavailable;
  for (const id of [
    "qty",
    "fee",
    "slip",
    "qtyDown",
    "qtyUp",
    "orderKind",
    "entryPrice",
  ])
    $(id).disabled = !!(replay.position || replay.pending);
  renderPosition($("positionBox"), replay, symbol);
  const open = replay.position,
    pending = replay.pending;
  $("quickPosition").hidden = !open && !pending;
  $("quickPositionText").textContent = open
    ? `${open.side === 1 ? "LONG" : "SHORT"} · ${symbol} · ${open.qty} @ ${price(open.entry)}`
    : pending
      ? `${pending.side === 1 ? "LONG" : "SHORT"} · ${pending.kind.toUpperCase()} · ${symbol}`
      : "";
  $("quickPositionPnl").textContent = open
    ? money(
        (replay.current.close - open.entry) *
          open.side *
          contracts[symbol].point *
          open.qty -
          2 * open.fee * open.qty,
      )
    : "";
  $("quickClose").textContent = pending
    ? translate("Отменить заявку")
    : replay.closePending
      ? translate("Выход ожидается")
      : translate("Закрыть всё");
  $("quickClose").disabled = !!(replay.closePending || (open && replay.ended));
  if (save) product?.saveReplay(replay.snapshot());
  comparison?.render();
  riskPreview();
  renderLines();
  syncPlayback();
  orderflow?.refresh();
}
function download(name: any, text: any) {
  const blob = new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("setupOpen").onclick = () => openSetup();
$("importOpen").onclick = () => {
  pause();
  $("importSymbol").value = symbol;
  $("importError").textContent = "";
  $("csvFile").value = "";
  $("importDialog").showModal();
};
document
  .querySelectorAll<HTMLElement>("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
for (const next of ["NQ", "ES"])
  $("session" + next).onchange = () => {
    const preferred = product.store.value.settings.datasets?.[setupPreferredId];
    if (preferred && !setupSymbols().includes(preferred.symbol))
      setupPreferredId = "";
    setupAvailability();
  };
$("setupYears").onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-setup-year]",
  );
  if (!b || b.disabled) return;
  const year = b.dataset.setupYear,
    first = $("fromDate").min,
    last = $("toDate").max;
  $("fromDate").value = first > year + "-01-01" ? first : year + "-01-01";
  $("toDate").value = last < year + "-12-31" ? last : year + "-12-31";
  previewRange();
};
$("fromDate").onchange = previewRange;
$("toDate").onchange = previewRange;
$("sessionName").oninput = () => {
  $("sessionName").setCustomValidity(
    $("sessionName").value.trim() ? "" : translate("Введите название сессии."),
  );
};
$("setupForm").onsubmit = async (e) => {
  e.preventDefault();
  if (settingUp) return;
  const button = $("setupForm").querySelector<HTMLElement>("[type=submit]"),
    token = ++setupToken,
    label = button.textContent;
  settingUp = true;
  (button as HTMLButtonElement).disabled = true;
  button.textContent = translate("Загружаю данные…");
  try {
    const name = $("sessionName").value.trim();
    if (!name) throw Error(translate("Введите название сессии."));
    const selected = setupSymbols(),
      next = setupPrimary(),
      a = $("fromDate").value,
      b = $("toDate").value,
      capital = Number($("sessionCapital").value),
      entries: any = selectHistories(
        product.store.value.settings.datasets,
        selected,
        a,
        b,
        setupPreferredId,
      );
    if (!ACCOUNT_DEPOSITS.some((amount) => amount === capital))
      throw Error(translate("Выберите начальный капитал из списка."));
    const loaded = await Promise.all(
      entries.map((entry) => loadHistoryById(entry.id, a, b)),
    );
    if (token !== setupToken || !$("setupDialog").open) return;
    if (
      selected.join() !== setupSymbols().join() ||
      a !== $("fromDate").value ||
      b !== $("toDate").value
    )
      throw Error(
        translate("Параметры изменены. Нажмите «Начать сессию» ещё раз."),
      );
    for (let i = 0; i < selected.length; i++) {
      assertDatasetSymbol(loaded[i], entries[i].id, selected[i]);
      selectReplayBars(loaded[i], a, b, activeSession);
    }
    const old = Object.fromEntries(
      selected.map((instrument) => [instrument, datasets[instrument]]),
    );
    for (let i = 0; i < selected.length; i++) datasets[selected[i]] = loaded[i];
    try {
      canReset();
      startSession(next, a, b, activeSession, {
        name,
        capital,
        strategyId: $("sessionStrategy").value,
        comparisonDatasetId:
          selected.length === 2 ? datasets[next === "NQ" ? "ES" : "NQ"].id : "",
      });
      $("setupDialog").close();
      product.navigate("replay");
    } catch (error) {
      for (const instrument of selected) datasets[instrument] = old[instrument];
      throw error;
    }
  } catch (error) {
    $("setupError").textContent = error.message;
  } finally {
    settingUp = false;
    (button as HTMLButtonElement).disabled = false;
    button.textContent = label;
  }
};
$("setupDialog").addEventListener("close", () => {
  setupPreferredId = "";
  setupToken++;
});
$("symbol").onchange = async () => {
  if (orderflow?.isStreaming()) {
    orderflow.refresh();
    return;
  }
  const next = $("symbol").value;
  if (!canReset()) {
    $("symbol").value = symbol;
    return;
  }
  $("symbol").disabled = true;
  try {
    const d = await loadHistory(next, from, to),
      old = datasets[next];
    datasets[next] = d;
    try {
      startSession(next, from, to, activeSession, {
        comparisonDatasetId: product.active()?.comparisonDatasetId
          ? datasets[symbol].id
          : "",
      });
      riskPreview();
    } catch (error) {
      datasets[next] = old;
      throw error;
    }
  } catch (error) {
    $("symbol").value = symbol;
    toast(error.message);
  } finally {
    $("symbol").disabled = false;
  }
};
$("play").onclick = togglePlay;
$("quickClose").onclick = () =>
  guard(() => {
    pause();
    if (replay.pending) replay.cancelOrder();
    else if (replay.position) replay.requestClose();
    render();
  });
installSessionJump({
  getReplay: () => replay,
  pause,
  jump: (session) => guard(() => skipToOpening(session)),
});
$("back").onclick = () => guard(rewindCandle);
$("step").onclick = () => {
  pause();
  step();
};
$("speed").onchange = () => {
  if (timer) {
    pause();
    togglePlay();
  }
};
$("long").onclick = () => guard(() => order(1));
$("short").onclick = () => guard(() => order(-1));
$("qtyDown").onclick = () => {
  $("qty").value = String(Math.max(1, Number($("qty").value) - 1));
  riskPreview();
};
$("qtyUp").onclick = () => {
  $("qty").value = String(Math.min(100, Number($("qty").value) + 1));
  riskPreview();
};
for (const id of ["qty", "fee", "slip"])
  $(id).oninput = riskPreview;
$("positionBox").addEventListener("focusin", pause);
$("positionBox").onclick = (e) => {
  const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")
    ?.dataset.action;
  if (!action) return;
  guard(() => {
    pause();
    if (action === "cancel") {
      replay.cancelOrder();
      toast(translate("Заявка отменена"));
    }
    if (action === "be" || action === "be-costs") {
      replay.breakEven(action === "be-costs");
      toast(
        action === "be-costs"
          ? translate("BE с издержками")
          : translate("Стоп на цене входа"),
      );
    }
    if (action === "close" || action === "partial") {
      replay.requestClose(
        action === "partial"
          ? Number(
              (
                $("positionBox").querySelector<HTMLElement>(
                  "[data-close-qty]",
                ) as HTMLInputElement
              ).value,
            )
          : null,
      );
      toast(translate("Выход на следующем открытии"));
    }
    if (action === "protect") {
      const level = (selector: string) => {
        const value = ($("positionBox").querySelector(selector) as HTMLInputElement).value;
        return value ? Number(value) : null;
      };
      replay.modifyProtection({sl: level("[data-position-sl]"), tp: level("[data-position-tp]")});
      toast(translate("Уровни обновлены"));
    }
    if (action === "review") product.reviewLatest();
    render();
  });
};
function syncOrderKind() {
  const kind = $("orderKind").value;
  $("entryPriceWrap").hidden = kind === "market";
  $("orderTypeBadge").textContent = kind.toUpperCase();
  $("quickOrderType").textContent = kind.toUpperCase();
  $("orderHint").textContent =
    kind === "market"
      ? translate("Market исполняется по текущей цене с учётом издержек")
      : kind === "limit"
        ? translate(
            "Limit исполняется по указанной цене или лучше на последующих свечах.",
          )
        : translate(
            "Stop активируется на последующих свечах с учётом гэпа и проскальзывания.",
          );
}
$("orderKind").onchange = () => {
  syncOrderKind();
  if (replay) $("entryPrice").value = replay.current.close;
};
document.querySelectorAll<HTMLElement>("[data-tf]").forEach(
  (b) =>
    (b.onclick = () => {
      if (drawingWorkspace?.activeId === "comparison") {
        comparison.setTimeframe(Number(b.dataset.tf));
        syncPaneToolbar();
        drawingWorkspace.refresh();
        return;
      }
      const left = chart.timeScale().getVisibleRange?.()?.from ?? null;
      tf = Number(b.dataset.tf);
      document.querySelectorAll<HTMLElement>("[data-tf]").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      tools?.cancel();
      rebuildChart(left);
      render();
    }),
);
document.addEventListener("keydown", (e) => {
  if ($("view-replay").hidden || document.querySelector<HTMLElement>(".product-main")?.inert) return;
  if (
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(
      (e.target as HTMLElement).tagName,
    ) ||
    (e.target as HTMLElement).isContentEditable ||
    document.querySelector<HTMLDialogElement>("dialog[open]")
  )
    return;
  if (e.code === "KeyB" && !e.ctrlKey && !e.metaKey) {
    guard(() => order(1));
  }
  if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) {
    guard(() => order(-1));
  }
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  }
  if (e.code === "ArrowLeft") {
    e.preventDefault();
    guard(rewindCandle);
  }
  if (e.code === "ArrowRight") {
    e.preventDefault();
    pause();
    step();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
$("csvFile").onchange = async () => {
  const file = $("csvFile").files[0];
  if (!file || importing) return;
  const next = $("importSymbol").value;
  importing = true;
  pause();
  $("csvFile").disabled = true;
  $("importSymbol").disabled = true;
  $("csvFormat").disabled = true;
  const close = $("importDialog").querySelector<HTMLElement>("[data-close]");
  (close as HTMLButtonElement).disabled = true;
  $("importDialog").onkeydown = (e) => {
    if (e.key === "Escape") e.preventDefault();
  };
  try {
    const result: any = await importArchive(file, {
      symbol: next,
      format: $("csvFormat").value,
      onProgress: (state) =>
        ($("importError").textContent =
          translate("Проверено ") +
          state.count.toLocaleString(locale()) +
          translate(" свечей · сохранено ") +
          state.parts +
          translate(" частей…")),
      onPart: async (bars, index) =>
        product.store.uploadDataset({
          symbol: next,
          name: (file.name + translate(" · часть ") + (index + 1)).slice(
            0,
            180,
          ),
          source: "user_csv",
          bars,
        }),
    });
    const archive: any = await product.store.createArchive({
      id: crypto.randomUUID(),
      symbol: next,
      name: file.name.slice(0, 180),
      parts: result.parts.map((p) => ({ id: p.id })),
      hasContracts: result.hasContracts,
    });
    product.registerArchive(archive);
    $("importDialog").close();
    openSetup(next, archive.id);
    toast(
      translate("Данные сохранены: ") +
        result.count.toLocaleString(locale()) +
        translate(" свечей") +
        (result.hasContracts
          ? ""
          : translate(". Нет contract: ролловер определить нельзя.")),
    );
  } catch (error) {
    $("importError").textContent = error.message;
  } finally {
    importing = false;
    $("csvFile").disabled = false;
    $("importSymbol").disabled = false;
    $("csvFormat").disabled = false;
    (close as HTMLButtonElement).disabled = false;
    $("importDialog").onkeydown = null;
  }
};
$("sample").onclick = () => {
  const rows = demo($("importSymbol").value as Instrument).slice(0, 120);
  download(
    "synthetic-sample-1m.csv",
    "time,open,high,low,close,volume\n" +
      rows
        .map((b) =>
          [
            new Date(b.time * 1000).toISOString(),
            b.open,
            b.high,
            b.low,
            b.close,
            b.volume,
          ].join(","),
        )
        .join("\n"),
  );
  toast(translate("Пример содержит синтетические данные."));
};
product = createProduct({
  toast,
  openDataset,
  onNavigate: (next) => {
    if (next !== "replay") {
      pause();
    } else if (!replay) {
      openSetup();
    }
  },
  activate: activateRecord,
  getPreferences: () => tools?.preferences || loadSettings(),
  setPreferences: (p) => {
    try {
      localStorage.setItem("eazy-trading-chart-v3", JSON.stringify(p));
    } catch {}
    if (tools) tools.updatePreferences(p);
  },
  capture: async () => {
    if (!chart) throw Error(translate("График недоступен"));
    pause();
    product.navigate("replay");
    await new Promise((r: any) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const canvas = chart.takeScreenshot();
    const drawing = $("chart").querySelector<HTMLElement>(".chart-drawings");
    if (drawing) {
      const svg = drawing.cloneNode(true);
      (svg as HTMLElement).setAttribute("xmlns", "http://www.w3.org/2000/svg");
      (svg as HTMLElement).setAttribute(
        "width",
        String($("chart").clientWidth),
      );
      (svg as HTMLElement).setAttribute(
        "height",
        String($("chart").clientHeight),
      );
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
      );
      try {
        const image = new Image();
        await new Promise((resolve: any, reject: any) => {
          image.onload = resolve;
          image.onerror = () =>
            reject(Error(translate("Не удалось включить разметку в скриншот")));
          image.src = url;
        });
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/png"),
    );
    if (!blob) throw Error(translate("Не удалось снять график"));
    return new File([blob], "replay-chart-" + symbol + ".png", {
      type: "image/png",
    });
  },
});
async function bootstrap() {
  const saved: any = await product.load();
  for (const [key, d] of Object.entries<any>(datasets))
    product.registerDataset(d.id, d, key);
  for (const archive of curatedArchives) product.registerArchive(archive);
  try {
    initChart();
    comparison = createComparison({
      getPriceLevels: positionLevels,
      primary: chart,
      primarySeries: series,
      getPrimaryBars: () => chartBars,
      getTimeframe: () => tf,
      getDatasets: () => datasets,
      getSymbol: () => symbol,
      getTime: () => replay?.current.time || 0,
      getPreferences: () => tools?.preferences || loadSettings(),
      onShow: loadComparisonData,
      getDisplaySymbol: () => paneSymbols.comparison,
      onChartReady: (ctx: any) => {
        comparisonContext = ctx;
        comparisonHistory = createTradeHistory(ctx.series);
        comparisonEntryControl = installEntryControl(
          "comparison", ctx.chart, ctx.series, ctx.container,
        );
        installPositionDragging(
          "comparison",
          ctx.chart,
          ctx.series,
          ctx.container,
        );
        drawingWorkspace.addPane({
          ...ctx,
          applySettings: (value: any) => tools.updatePreferences(value),
          openSettings: () => tools.openSettings(),
          resetView: () => {
            comparison?.releaseViewport();
            ctx.chart.priceScale("right").applyOptions({ autoScale: true });
            ctx.chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-3, ctx.getBars().length - 90),
              to: ctx.getBars().length + 10,
            });
          },
        });
      },
      onChartRender: () => {
        drawingWorkspace.refresh();
        syncPaneToolbar();
        if (replay) renderLines();
      },
      onVisibilityChange: (visible: boolean) => {
        if (!visible && drawingWorkspace.activeId === "comparison")
          drawingWorkspace.activate("primary");
      },
    });
    installChartSplitter();
    installPaneInstrumentMenu({
      trigger: $("primaryChartTitle"),
      getSymbol: primaryInstrument,
      choose: (next: string) => choosePaneInstrument("primary", next),
      activate: () => drawingWorkspace.activate("primary"),
      toast,
    });
    installPaneInstrumentMenu({
      trigger: $("comparisonTitle"),
      getSymbol: () => paneSymbols.comparison,
      choose: (next: string) => choosePaneInstrument("comparison", next),
      activate: () => drawingWorkspace.activate("comparison"),
      toast,
    });
  } catch (e) {
    $("chartError").hidden = false;
    console.error(e);
  }
  if (saved) {
    try {
      await activateRecord(saved);
      return;
    } catch (e) {
      toast(translate("Не удалось восстановить сессию: ") + e.message);
    }
  }
}
bootstrap()
  .then(() => product.ready())
  .catch((error) => {
    toast(error.message);
    $("chartError").hidden = false;
  });
function readState() {
  if (!replay) return { loading: !product?.store.ready, hasSession: false };
  return {
    symbol,
    timeframeMinutes: tf,
    source: datasets[symbol].source || "user_csv",
    chartPreferences: tools?.preferences || loadSettings(),
    range: { from, to, timeZone: "America/New_York" },
    revealed: replay.index + 1,
    total: replay.bars.length,
    lastRevealedBar: replay.current,
    ended: replay.ended,
    pending: replay.pending,
    position: replay.position,
    stats: replay.stats(),
  };
}
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = (tool: any) => {
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {}
  };
  register({
    name: "get_replay_state",
    title: translate("Состояние replay"),
    description:
      "Read the current manual replay and revealed candle; never returns future prices.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => readState(),
  });
  register({
    name: "advance_replay",
    title: translate("Открыть следующие свечи"),
    description:
      "Pause autoplay and reveal 1 to 100 next one-minute candles. Simulated orders can fill. Stops on a closed trade or range end.",
    inputSchema: {
      type: "object",
      properties: { count: { type: "integer", minimum: 1, maximum: 100 } },
      required: ["count"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) => {
      if (
        !input ||
        !Number.isInteger(input.count) ||
        input.count < 1 ||
        input.count > 100 ||
        Object.keys(input).some((k) => k !== "count")
      )
        throw Error("count must be an integer from 1 to 100");
      if (!replay)
        throw Error(translate("Сначала создайте или продолжите сессию"));
      pause();
      const before = replay.trades.length;
      for (let i = 0; i < input.count; i++) {
        if (!step() || replay.trades.length > before) break;
      }
      return readState();
    },
  });
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
