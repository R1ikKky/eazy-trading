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
const nyTime = new Intl.DateTimeFormat("ru-RU", {
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
  setupPrimarySymbol = "NQ",
  setupPreferredId = "",
  setupToken = 0,
  settingUp = false,
  importing = false;
function chartPreferenceChanged(p: any) {
  product?.preferencesChanged(p);
  comparison?.render();
  displayTime = new Intl.DateTimeFormat("ru-RU", {
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
  new Date(s + "T12:00:00Z").toLocaleDateString("ru-RU", {
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
  markers: any,
  priceLines: any = [],
  chartBars = [],
  toastTimer,
  tools: any,
  historyController,
  orderflow: any,
  tradeOffset = 0,
  activeSession: any = loadSettings().session,
  lastChartSession = activeSession;
function toast(message: any) {
  $("toast").textContent = message;
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
function pause() {
  if (timer) clearInterval(timer);
  timer = null;
  syncPlayback();
}
function syncPlayback() {
  if (!replay) return;
  $("playIcon").textContent = timer ? "Ⅱ" : "▶";
  $("playLabel").textContent = timer ? "Пауза" : "Replay";
  $("play").setAttribute("aria-label", timer ? "Пауза" : "Воспроизвести");
  $("chartStatus").textContent = replay.ended
    ? "ЗАВЕРШЕНО"
    : timer
      ? "REPLAY"
      : "ПАУЗА";
  $("play").disabled = replay.ended || !chart;
  $("step").disabled = replay.ended || !chart;
}
function togglePlay() {
  if (orderflow?.isStreaming()) return;
  if (!chart || !replay || replay.ended) return;
  if (timer) {
    pause();
    return;
  }
  timer = setInterval(step, Number($("speed").value));
  syncPlayback();
}
function initChart() {
  const L = window.LightweightCharts;
  if (!L) throw Error("Библиотека графика не загрузилась.");
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
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
      tickMarkFormatter: (t) => nyClock.format(new Date(t * 1000)),
    },
    localization: {
      locale: "ru-RU",
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
  markers = L.createSeriesMarkers(series, []);
  tools = createChartTools({
    chart,
    series,
    volume,
    container: $("chart"),
    getBars: () => chartBars,
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
  chart.subscribeCrosshairMove((param) => {
    const b: any = tools?.lockedTime
      ? chartBars.find((b) => b.time === tools.lockedTime)
      : param.seriesData?.get(series);
    if (b?.close) showOhlc(b);
    else if (replay) showOhlc(chartBars.at(-1));
  });
  orderflow = createFootprint({
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
function rebuildChart(leftTime: any = null) {
  if (!chart) return;
  chartBars = aggregate(
    [...context, ...replay.bars.slice(0, replay.index + 1)].filter(
      (b) => tools?.preferences.session !== "rth" || isRegularSession(b.time),
    ),
    tf,
    (time, m) => barTime(time, m, tools?.preferences.session || activeSession),
  );
  series.setData(chartBars);
  volume.setData(chartBars.map(volBar));
  tools?.refresh();
  const right: any = tools?.preferences.marginRight ?? 10;
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
    series.update(last);
    volume.update(volBar(last));
    chart.timeScale().scrollToRealTime();
    tools?.refresh();
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
  tools?.cancel();
  symbol = s;
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
        (options.record ? options.record.name + " · повтор" : s + " · " + a),
      capital: options.capital || options.record?.capital || 50000,
      strategyId: options.strategyId || options.record?.strategyId || "",
    });
  $("symbol").value = symbol;
  $("contractName").textContent = contracts[symbol].name;
  $("rangeLabel").textContent = dateText(from) + " — " + dateText(to);
  $("tickInfo").textContent =
    "1 тик = " + money(contracts[symbol].point * 0.25);
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
  if (!record) throw Error("Сессия не найдена");
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
  const other = record.symbol === "NQ" ? "ES" : "NQ",
    otherData = record.comparisonDatasetId
      ? await loadHistoryById(
          record.comparisonDatasetId,
          record.from,
          record.to,
        )
      : null;
  if (otherData) {
    assertDatasetSymbol(otherData, record.comparisonDatasetId, other);
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
    throw Error("История второго инструмента не соответствует " + expected);
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
  if (!entry) throw Error("Исторические данные не найдены");
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
    ACCOUNT_DEPOSITS.some((amount) => amount === previousCapital) ? previousCapital : 50000,
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
  $("sourceName").textContent = d.name || "Ваш CSV";
  $("sourceRange").textContent =
    nyTime.format(new Date(d.bars[0].time * 1000)) +
    " — " +
    nyTime.format(new Date(d.bars.at(-1).time * 1000)) +
    " ET · " +
    d.bars.length.toLocaleString("ru-RU") +
    " свечей в загруженном диапазоне";
  $("providerNotes").hidden = d.source !== "hf_market_data";
  $("userSourceNote").hidden = d.source !== "user_csv";
  $("curatedSourceNotes").hidden = !curated;
  if (curated) {
    $("curatedSourceSummary").textContent = meta.note || "";
    $("curatedSourceDetails").textContent =
      "Источник: " +
      meta.provider +
      ". Загрузка: " +
      meta.retrievedAt +
      ". " +
      (meta.contracts?.length
        ? "Контракты / идентификаторы: " + meta.contracts.join(", ") + ". "
        : "Контрактные коды не указаны. ") +
      (meta.adjusted
        ? "Цены скорректированы источником. "
        : "Цены сохранены как в исходном архиве. ");
    $("curatedSourceLink").href = meta.sourceUrl;
  }
  $("sourceContracts").textContent =
    "Контракты: " +
    (meta.contracts?.join(", ") || "не указаны") +
    ". Загружено: " +
    (meta.fetchedAt
      ? new Date(meta.fetchedAt).toLocaleDateString("ru-RU")
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
    stop: Number($("stop").value),
    target: Number($("target").value),
    fee: Number($("fee").value),
    slip: Number($("slip").value),
    kind: $("orderKind").value,
    entryPrice:
      $("orderKind").value === "market" ? null : Number($("entryPrice").value),
  };
}
function riskPreview() {
  const c = config(),
    risk =
      c.qty *
      (c.stop * contracts[symbol].point +
        2 * c.fee +
        c.slip * 0.25 * contracts[symbol].point);
  $("riskValue").textContent =
    Number.isFinite(risk) && risk > 0 ? money(risk) : "—";
  $("rrValue").textContent =
    c.stop > 0 && c.target > 0 ? "1 : " + (c.target / c.stop).toFixed(1) : "—";
}
function order(side: any) {
  if (orderflow?.isStreaming())
    throw Error("Switch to Replay to simulate orders");
  if (!chart) throw Error("Сначала загрузите график.");
  replay.queue(side, config());
  render();
  toast(
    (side === 1 ? "Long" : "Short") +
      " · " +
      config().kind.toUpperCase() +
      " заявка создана",
  );
}
function step() {
  if (orderflow?.isStreaming()) return false;
  tradeOffset = 0;
  if (!replay || replay.ended) {
    pause();
    return false;
  }
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
        (t.ambiguous ? " · SL и TP в одной свече" : ""),
    );
  }
  if (replay.ended) {
    pause();
    toast(
      replay.position
        ? "Период завершён. Позиция остаётся открытой; её P&L не включён в статистику."
        : "Период завершён. Выберите новую сессию.",
    );
  }
  render();
  return true;
}
function renderLines() {
  if (!series) return;
  for (const l of priceLines) series.removePriceLine(l);
  priceLines = [];
  const p = replay.position;
  if (p) {
    for (const [title, v, color] of [
      ["ВХОД", p.entry, "#748b59"],
      ["SL", p.sl, "#cf6c66"],
      ["TP", p.tp, "#2a967a"],
    ])
      priceLines.push(
        series.createPriceLine({
          price: v,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        }),
      );
  }
  const out = [];
  const add: any = (t: any, side: any, exit = false) =>
    out.push({
      time: barTime(t, tf, activeSession),
      position: side === 1 ? "belowBar" : "aboveBar",
      color: exit ? "#718156" : side === 1 ? "#259176" : "#d57470",
      shape: exit ? "circle" : side === 1 ? "arrowUp" : "arrowDown",
      text: exit ? "" : side === 1 ? "L" : "S",
    });
  for (const t of replay.trades) {
    add(t.time, t.side);
    add(t.exitTime, -t.side, true);
  }
  if (p) add(p.time, p.side);
  out.sort((a, b) => a.time - b.time);
  markers.setMarkers(tools?.preferences.hideMarks ? [] : out);
}
function render() {
  $("primaryChartTitle").textContent = symbol + " · " + tf + "m";
  $("mainChartNotice").textContent =
    "Заявки по " + symbol + " · общий шаг replay 1 мин";
  const b: any = replay.current,
    s = replay.stats();
  $("contractName").textContent = b.contract || contracts[symbol].name;
  $("lastPrice").textContent = price(b.close);
  showOhlc(chartBars.at(-1));
  $("netStat").textContent = money(s.net);
  $("netStat").className = s.net > 0 ? "positive" : s.net < 0 ? "negative" : "";
  $("replayTime").textContent =
    displayTime.format(new Date(b.time * 1000)) + " " + displayZone;
  $("progressLabel").textContent =
    "Свеча " + (replay.index + 1) + " из " + replay.bars.length;
  $("progressBar").style.width =
    ((replay.index + 1) / replay.bars.length) * 100 + "%";
  $("baseInterval").textContent =
    "Шаг: 1 мин · " +
    displayZone +
    (tf > 1 ? " · " + tf + "m формируется" : "");
  const unavailable: any = !!(
    replay.position ||
    replay.pending ||
    replay.ended ||
    !chart
  );
  $("long").disabled = unavailable;
  $("short").disabled = unavailable;
  for (const id of [
    "qty",
    "stop",
    "target",
    "fee",
    "slip",
    "qtyDown",
    "qtyUp",
    "orderKind",
    "entryPrice",
    "sizeByRisk",
  ])
    $(id).disabled = !!(replay.position || replay.pending);
  renderPosition($("positionBox"), replay, symbol);
  product?.saveReplay(replay.snapshot());
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
function openHistory() {
  pause();
  $("historyDialog").showModal();
}
$("historyOpen").onclick = openHistory;
$("historyImport").onclick = () => {
  $("historyDialog").close();
  $("importOpen").click();
};
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
$("historyData").onclick = () => {
  $("historyDialog").close();
  $("setupOpen").click();
};
$("fromDate").onchange = previewRange;
$("toDate").onchange = previewRange;
$("sessionName").oninput = () => {
  $("sessionName").setCustomValidity(
    $("sessionName").value.trim() ? "" : "Введите название сессии.",
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
  button.textContent = "Загружаю данные…";
  try {
    const name = $("sessionName").value.trim();
    if (!name) throw Error("Введите название сессии.");
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
      throw Error("Выберите начальный капитал из списка.");
    const loaded = await Promise.all(
      entries.map((entry) => loadHistoryById(entry.id, a, b)),
    );
    if (token !== setupToken || !$("setupDialog").open) return;
    if (
      selected.join() !== setupSymbols().join() ||
      a !== $("fromDate").value ||
      b !== $("toDate").value
    )
      throw Error("Параметры изменены. Нажмите «Начать сессию» ещё раз.");
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
      $("stop").value = String(next === "NQ" ? 12 : 4);
      $("target").value = String(next === "NQ" ? 24 : 8);
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
$("reset").onclick = () => {
  if (canReset()) startSession(symbol, from, to);
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
for (const id of ["qty", "stop", "target", "fee", "slip"])
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
      toast("Заявка отменена");
    }
    if (action === "be" || action === "be-costs") {
      replay.breakEven(action === "be-costs");
      toast(action === "be-costs" ? "BE с издержками" : "Стоп на цене входа");
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
      toast("Выход на следующем открытии");
    }
    if (action === "protect") {
      replay.modifyProtection({
        sl: Number(
          (
            $("positionBox").querySelector<HTMLElement>(
              "[data-position-sl]",
            ) as HTMLInputElement
          ).value,
        ),
        tp: Number(
          (
            $("positionBox").querySelector<HTMLElement>(
              "[data-position-tp]",
            ) as HTMLInputElement
          ).value,
        ),
      });
      toast("Уровни обновлены");
    }
    if (action === "review") product.reviewLatest();
    render();
  });
};
$("orderKind").onchange = () => {
  const kind = $("orderKind").value;
  $("entryPriceWrap").hidden = kind === "market";
  $("orderTypeBadge").textContent = kind.toUpperCase();
  $("orderHint").textContent =
    kind === "market"
      ? "Вход на следующем открытии. Одна позиция за раз."
      : kind === "limit"
        ? "Limit исполняется по указанной цене или лучше на последующих свечах."
        : "Stop активируется на последующих свечах с учётом гэпа и проскальзывания.";
  if (replay) $("entryPrice").value = replay.current.close;
};
$("sizeByRisk").onclick = () =>
  guard(() => {
    const budget = Number($("riskBudget").value),
      c = config(),
      per =
        c.stop * contracts[symbol].point +
        2 * c.fee +
        c.slip * 0.25 * contracts[symbol].point;
    if (
      !Number.isFinite(budget) ||
      budget <= 0 ||
      !Number.isFinite(per) ||
      per <= 0
    )
      throw Error("Укажите риск и положительный стоп");
    const qty = Math.min(100, Math.floor(budget / per));
    if (qty < 1)
      throw Error(
        "Один контракт превышает заданный риск. Уменьшите стоп или увеличьте лимит.",
      );
    $("qty").value = String(qty);
    riskPreview();
    toast("Объём " + qty + " контр. · риск не больше " + money(budget));
  });

document.querySelectorAll<HTMLElement>("[data-tf]").forEach(
  (b) =>
    (b.onclick = () => {
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
  if ($("view-replay").hidden) return;
  if (
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
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
          "Проверено " +
          state.count.toLocaleString("ru-RU") +
          " свечей · сохранено " +
          state.parts +
          " частей…"),
      onPart: async (bars, index) =>
        product.store.uploadDataset({
          symbol: next,
          name: (file.name + " · часть " + (index + 1)).slice(0, 180),
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
      "Данные сохранены: " +
        result.count.toLocaleString("ru-RU") +
        " свечей" +
        (result.hasContracts
          ? ""
          : ". Нет contract: ролловер определить нельзя."),
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
  toast("Пример содержит синтетические данные.");
};
product = createProduct({
  toast,
  openDataset,
  onNavigate: (next) => {
    if (next !== "replay") {
      pause();
      comparison?.setExpanded(false);
    } else if (!replay) {
      openSetup();
      return false;
    }
  },
  activate: activateRecord,
  getPreferences: () => tools?.preferences || loadSettings(),
  setPreferences: (p) => {
    try {
      localStorage.setItem("replay-lab-chart-v3", JSON.stringify(p));
    } catch {}
    if (tools) tools.updatePreferences(p);
  },
  capture: async () => {
    if (!chart) throw Error("График недоступен");
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
            reject(Error("Не удалось включить разметку в скриншот"));
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
    if (!blob) throw Error("Не удалось снять график");
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
      primary: chart,
      primarySeries: series,
      getPrimaryBars: () => chartBars,
      getTimeframe: () => tf,
      getDatasets: () => datasets,
      getSymbol: () => symbol,
      getTime: () => replay?.current.time || 0,
      getPreferences: () => tools?.preferences || loadSettings(),
      onShow: loadComparisonData,
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
      toast("Не удалось восстановить сессию: " + e.message);
    }
  }
  product.navigate("sessions");
}
bootstrap().catch((error) => {
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
    title: "Состояние replay",
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
    title: "Открыть следующие свечи",
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
      if (!replay) throw Error("Сначала создайте или продолжите сессию");
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
