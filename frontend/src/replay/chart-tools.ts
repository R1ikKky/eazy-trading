import { t as translate, tr } from "../i18n/language";
import { element as $ } from "./dom";
import {
  defaults,
  presets,
  loadSettings,
  settingsColor,
  chartDate,
  chartTimeScale,
  isRegularSession,
  isExtendedSession,
  sanitizeSettings,
} from "./settings-model";
import { dayKey } from "./engine";
import { createChartSettings } from "./chart-settings";
import {
  createReplayScaleLock,
  releaseOnPriceAxisReset,
} from "./replay-scale-lock";
import { includeTradeLevels } from "./trade-levels";
export { presets, loadSettings };
export function indicatorValues(bars: any, period: any, kind: any) {
  let window = [],
    sum = 0,
    ema = null,
    contract;
  const result = [],
    alpha = 2 / (period + 1);
  for (const b of bars) {
    if (contract && b.contract && contract !== b.contract) {
      window = [];
      sum = 0;
      ema = null;
    }
    contract = b.contract;
    window.push(b.close);
    sum += b.close;
    if (window.length > period) sum -= window.shift();
    if (window.length < period) continue;
    if (kind === "ema")
      ema = ema === null ? sum / period : alpha * b.close + (1 - alpha) * ema;
    result.push({ time: b.time, value: kind === "ema" ? ema : sum / period });
  }
  return result;
}

export function createChartTools({
  chart,
  series,
  volume,
  container,
  getBars,
  getNow,
  getScope,
  onChange,
  onSessionCommit,
  onDrawingsChange,
  toast,
  pause,
  drawingWorkspace,
  getSymbol = () => $("symbol").value,
  getTimeframe = () => 1,
  getPriceLevels = () => [],
}: any) {
  const L = window.LightweightCharts,
    prefs = loadSettings();
  const sma = chart.addSeries(L.LineSeries, {
    color: prefs.smaColor,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: true,
    title: "SMA",
  });
  const ema = chart.addSeries(L.LineSeries, {
    color: prefs.emaColor,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: true,
    title: "EMA",
  });
  let lockedTime: any = null,
    decorationLines: any[] = [],
    settings: any,
    frame = 0;
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.classList.add("chart-decorations");
  svg.setAttribute("aria-hidden", "true");
  container.append(svg);
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
        drawingWorkspace.refresh();
      });
  };
  const syncScope = () => {};
  function persist() {
    try {
      localStorage.setItem("eazy-trading-chart-v3", JSON.stringify(prefs));
    } catch {
      toast(translate("Не удалось сохранить настройки."));
    }
  }
  function node(tag: any, attrs: any) {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries<any>(attrs))
      n.setAttribute(k, String(v));
    return n;
  }
  function xAt(time: any) {
    const direct = chart.timeScale().timeToCoordinate(time);
    if (direct !== null) return direct;
    const bars = getBars();
    if (!bars.length) return null;
    let lo = 0,
      hi = bars.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (bars[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    const minutes = getTimeframe();
    if (time > bars.at(-1).time)
      return chart
        .timeScale()
        .logicalToCoordinate(
          bars.length - 1 + (time - bars.at(-1).time) / (minutes * 60),
        );
    if (time < bars[0].time)
      return chart
        .timeScale()
        .logicalToCoordinate((time - bars[0].time) / (minutes * 60));
    return chart.timeScale().logicalToCoordinate(lo);
  }
  function paint() {
    svg.replaceChildren();
    const w = container.clientWidth,
      h = container.clientHeight;
    if (!w || !h) return;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    const left = chart.priceScale("left").width?.() || 0,
      right = chart.priceScale("right").width?.() || 0;
    const defs = node("defs", {}),
      clip = node("clipPath", { id: "drawing-plot-clip" });
    clip.append(
      node("rect", {
        x: left,
        y: 0,
        width: Math.max(0, w - left - right),
        height: Math.max(0, h - chart.timeScale().height()),
      }),
    );
    defs.append(clip);
    svg.append(defs);
    const group = node("g", { "clip-path": "url(#drawing-plot-clip)" });
    svg.append(group);
    const bars = getBars(),
      range = chart.timeScale().getVisibleLogicalRange?.();
    if (prefs.sessionBreaks) {
      const start = Math.max(
          1,
          Math.floor(range?.from ?? Math.max(0, bars.length - 100)),
        ),
        end = Math.min(bars.length, Math.ceil(range?.to ?? bars.length) + 1);
      for (let i = start; i < end; i++)
        if (dayKey(bars[i].time + 21600) !== dayKey(bars[i - 1].time + 21600)) {
          const x = xAt(bars[i].time);
          if (x !== null)
            group.append(
              node("line", {
                x1: x + left,
                y1: 0,
                x2: x + left,
                y2: h - chart.timeScale().height(),
                stroke: settingsColor(prefs, "sessionBreakColor"),
                "stroke-width": 1,
                "stroke-dasharray":
                  prefs.sessionBreakStyle === 0
                    ? "none"
                    : prefs.sessionBreakStyle === 1
                      ? "2 3"
                      : "6 4",
              }),
            );
        }
    }
    if (lockedTime && prefs.crosshair) {
      const x = xAt(lockedTime);
      if (x !== null)
        group.append(
          node("line", {
            x1: x + left,
            y1: 0,
            x2: x + left,
            y2: h - chart.timeScale().height(),
            stroke: settingsColor(prefs, "crosshairColor"),
            "stroke-width": prefs.crosshairWidth,
            "stroke-dasharray": prefs.crosshairStyle === 0 ? "none" : "6 4",
          }),
        );
    }
    const y = bars.length ? series.priceToCoordinate(bars.at(-1).close) : null;
    if (y !== null)
      for (const id of ["chartReplayCountdown", "chartPriceBadge"]) {
        const el = $(id);
        el.style.top = Math.max(0, Math.min(h - 42, y)) + "px";
        el.style.right = prefs.scalePlacement === "left" ? "auto" : "2px";
        el.style.left = prefs.scalePlacement === "left" ? "2px" : "auto";
      }
    if (!$("chartReplayCountdown").hidden && !$("chartPriceBadge").hidden)
      $("chartReplayCountdown").style.transform = "translateY(22px)";
    else $("chartReplayCountdown").style.transform = "";
  }
  const overlay = document.createElement("div");
  overlay.className = "chart-overlays";
  overlay.innerHTML =
    '<div id="chartWatermark" class="chart-watermark" aria-hidden="true"></div><div id="chartScaleModes" class="chart-scale-modes"><button type="button" data-scale-mode="auto" title="Automatic price scale">A</button><button type="button" data-scale-mode="log" title="Logarithmic price scale">L</button></div><div id="chartNavigation" class="chart-navigation"><button type="button" data-nav="out" aria-label="Zoom out">−</button><button type="button" data-nav="in" aria-label="Zoom in">＋</button><button type="button" data-nav="left" aria-label="Move chart left">‹</button><button type="button" data-nav="right" aria-label="Move chart right">›</button><button type="button" data-nav="reset" aria-label="Reset chart view">↶</button></div><button id="chartPaneButton" class="chart-pane-button" title="Fullscreen chart" aria-label="Fullscreen chart">⛶</button><button id="chartAxisPlus" class="chart-axis-plus" aria-label="Add horizontal level at cursor" title="Add price level" hidden>＋</button><div id="chartReplayCountdown" class="chart-countdown" hidden></div><div id="chartPriceBadge" class="chart-price-badge" hidden></div>';
  container.append(overlay);
  const description = () =>
    getSymbol() === "NQ" ? "E-mini Nasdaq-100" : "E-mini S&P 500";
  const decimal = () =>
    prefs.precision === "default" ? 2 : Number(prefs.precision);
  const formatPrice = (v: any) =>
    Number(v).toLocaleString("en-US", {
      minimumFractionDigits: decimal(),
      maximumFractionDigits: decimal(),
    });
  const viewportScale = createReplayScaleLock();
  const smaScale = createReplayScaleLock();
  const emaScale = createReplayScaleLock();
  const viewportScales = [viewportScale, smaScale, emaScale];
  const releaseViewport = () =>
    viewportScales.forEach((scale) => scale.release());
  releaseOnPriceAxisReset(chart, container, releaseViewport, () => {
    const last = getBars().at(-1);
    if (last) series.update(last);
  });
  function apply() {
    releaseViewport();
    const background =
      prefs.backgroundType === "gradient"
        ? {
            type: "gradient",
            topColor: settingsColor(prefs, "background"),
            bottomColor: settingsColor(prefs, "backgroundBottom"),
          }
        : { type: "solid", color: settingsColor(prefs, "background") };
    const priceScale = prefs.scalePlacement === "left" ? "left" : "right",
      line = settingsColor(prefs, "scaleLines");
    const scaleMode = {
      normal: L.PriceScaleMode.Normal,
      log: L.PriceScaleMode.Logarithmic,
      percentage: L.PriceScaleMode.Percentage,
      indexed: L.PriceScaleMode.IndexedTo100,
    }[prefs.scale];
    const scaleOptions = {
      mode: scaleMode,
      invertScale: prefs.invert,
      autoScale: prefs.autoScale || prefs.lockRatio,
      alignLabels: prefs.alignLabels,
      borderColor: line,
      borderVisible: (prefs.colorOpacity.scaleLines ?? 100) > 0,
      scaleMargins: {
        top: prefs.marginTop / 100,
        bottom: Math.max(prefs.marginBottom / 100, prefs.volume ? 0.22 : 0),
      },
    };
    chart.applyOptions({
      layout: {
        background,
        textColor: settingsColor(prefs, "text"),
        fontSize: prefs.fontSize,
      },
      grid: {
        vertLines: {
          visible: ["both", "vertical"].includes(prefs.gridMode),
          color: settingsColor(prefs, "gridColor"),
        },
        horzLines: {
          visible: ["both", "horizontal"].includes(prefs.gridMode),
          color: settingsColor(prefs, "gridColor"),
        },
      },
      crosshair: {
        vertLine: {
          visible: prefs.crosshair && !lockedTime,
          labelVisible: prefs.crosshair && !lockedTime,
          color: settingsColor(prefs, "crosshairColor"),
          style: prefs.crosshairStyle,
          width: prefs.crosshairWidth,
          labelBackgroundColor: "#363636",
        },
        horzLine: {
          visible: prefs.crosshair,
          labelVisible: prefs.crosshair,
          color: settingsColor(prefs, "crosshairColor"),
          style: prefs.crosshairStyle,
          width: prefs.crosshairWidth,
          labelBackgroundColor: "#363636",
        },
      },
      timeScale: {
        shiftVisibleRangeOnNewBar: false,
        barSpacing: prefs.barSpacing,
        rightOffset: prefs.marginRight,
        borderColor: line,
        borderVisible: (prefs.colorOpacity.scaleLines ?? 100) > 0,
        ...chartTimeScale(prefs),
      },
      rightPriceScale: { ...scaleOptions, visible: priceScale === "right" },
      leftPriceScale: { ...scaleOptions, visible: priceScale === "left" },
      localization: {
        timeFormatter: (t) => chartDate(t, prefs),
        priceFormatter: formatPrice,
      },
    });
    container.style.background = prefs.background;
    container.dataset.scaleModes = prefs.scaleModes;
    container.dataset.navigation = prefs.navigation;
    container.dataset.paneButtons = prefs.paneButtons;
    $("chartScaleModes").style[
      prefs.scalePlacement === "left" ? "left" : "right"
    ] = "4px";
    $("chartScaleModes").style[
      prefs.scalePlacement === "left" ? "right" : "left"
    ] = "auto";
    const hasLine = ["both", "line"].includes(prefs.symbolLabels),
      hasValue = ["both", "value"].includes(prefs.symbolLabels),
      customPrice =
        hasValue &&
        prefs.symbolLabelValue === "price" &&
        ["percentage", "indexed"].includes(prefs.scale);
    series.applyOptions({
      priceScaleId: priceScale,
      upColor: prefs.body ? settingsColor(prefs, "up") : "rgba(0,0,0,0)",
      downColor: prefs.body ? settingsColor(prefs, "down") : "rgba(0,0,0,0)",
      borderVisible: prefs.borders,
      borderUpColor: settingsColor(prefs, "borderUp"),
      borderDownColor: settingsColor(prefs, "borderDown"),
      wickVisible: prefs.wicks,
      wickUpColor: settingsColor(prefs, "wickUp"),
      wickDownColor: settingsColor(prefs, "wickDown"),
      priceLineColor: settingsColor(prefs, "symbolLineColor"),
      priceLineStyle: prefs.symbolLineStyle,
      priceLineVisible: hasLine,
      lastValueVisible: hasValue && !customPrice,
      priceFormat: { type: "custom", minMove: 0.25, formatter: formatPrice },
      autoscaleInfoProvider: (base) =>
        viewportScale.apply(() => {
          const info = includeTradeLevels(base(), getPriceLevels());
          if (!prefs.lockRatio || !info) return info;
          const range = info.priceRange,
            center = (range.minValue + range.maxValue) / 2,
            spacing =
              chart.timeScale().options?.().barSpacing || prefs.barSpacing,
            available =
              (container.clientHeight - chart.timeScale().height()) *
              (1 -
                prefs.marginTop / 100 -
                Math.max(prefs.marginBottom / 100, prefs.volume ? 0.22 : 0)),
            span = Math.max(0.5, (available * prefs.priceBarRatio) / spacing);
          return includeTradeLevels(
            {
              ...info,
              priceRange: {
                minValue: Math.max(0.25, center - span / 2),
                maxValue: center + span / 2,
              },
            },
            getPriceLevels(),
          );
        }),
    });
    chart.applyOptions({
      handleScale: drawingWorkspace.isNavigation("primary")
        ? {
            axisPressedMouseMove: { time: true, price: !prefs.lockRatio },
            axisDoubleClickReset: { time: true, price: !prefs.lockRatio },
            mouseWheel: true,
            pinch: true,
          }
        : false,
    });
    volume.applyOptions({ visible: prefs.volume });
    sma.applyOptions({
      visible: prefs.sma,
      color: settingsColor(prefs, "smaColor"),
      priceScaleId: priceScale,
      title: "SMA " + prefs.smaPeriod,
      autoscaleInfoProvider: (base) =>
        prefs.lockRatio ? null : smaScale.apply(base),
    });
    ema.applyOptions({
      visible: prefs.ema,
      color: settingsColor(prefs, "emaColor"),
      priceScaleId: priceScale,
      title: "EMA " + prefs.emaPeriod,
      autoscaleInfoProvider: (base) =>
        prefs.lockRatio ? null : emaScale.apply(base),
    });
    $("chartWatermark").hidden = prefs.watermark === "hidden";
    $("chartWatermark").textContent =
      prefs.watermark === "description" ? description() : getSymbol();
    $("chartWatermark").style.color = settingsColor(prefs, "watermarkColor");
    $("chartScaleModes")
      .querySelector("[data-scale-mode=auto]")
      .classList.toggle("active", prefs.autoScale);
    $("chartScaleModes")
      .querySelector("[data-scale-mode=log]")
      .classList.toggle("active", prefs.scale === "log");
    refresh();
    onChange?.(prefs);
  }
  function updateLegend(b: any) {
    $("chartWatermark").textContent =
      prefs.watermark === "description" ? description() : getSymbol();
    if (!b) {
      $("statusTitle").textContent = getSymbol();
      $("ohlc").textContent = "";
      $("barChange").textContent = "";
      $("statusVolume").textContent = "";
      $("lastPrice").textContent = "—";
      return;
    }
    $("statusTitle").hidden = !prefs.title;
    $("statusTitle").textContent =
      prefs.titleType === "description"
        ? description()
        : prefs.titleType === "both"
          ? getSymbol() + " · " + description()
          : b.contract || getSymbol();
    $("ohlc").hidden = !prefs.chartValues;
    $("lastPrice").hidden = !prefs.chartValues;
    $("marketOpenStatus").hidden = !prefs.marketStatus;
    const open =
      prefs.session === "rth"
        ? isRegularSession(b.time)
        : isExtendedSession(b.time);
    $("marketOpenStatus").classList.toggle("closed", !open);
    $("marketOpenStatus").title =
      translate("Историческая сессия: ") +
      (open ? translate("рынок открыт") : translate("рынок закрыт"));
    $("marketOpenStatus").setAttribute(
      "aria-label",
      $("marketOpenStatus").title,
    );
    const all = getBars();
    let lo = 0,
      hi = all.length - 1;
    while (lo < hi) {
      const m = Math.floor((lo + hi) / 2);
      if (all[m].time < b.time) lo = m + 1;
      else hi = m;
    }
    const prev = lo > 0 ? all[lo - 1] : null,
      change = prev ? b.close - prev.close : 0;
    $("barChange").hidden = !prefs.barChanges;
    $("barChange").textContent =
      (change >= 0 ? "+" : "") +
      formatPrice(change) +
      " (" +
      (prev ? ((change / prev.close) * 100).toFixed(2) : "0.00") +
      "%)";
    $("statusVolume").hidden = !prefs.statusVolume;
    $("statusVolume").textContent =
      "Vol " + (b.volume || 0).toLocaleString("en-US");
    const legend = document.querySelector<HTMLElement>(".chart-legend");
    legend.style.background = "var(--surface)";
    legend.style.color = "var(--text)";
    const tf =
        Number(
          document.querySelector<HTMLInputElement>("[data-tf].selected")
            ?.dataset.tf,
        ) || 1,
      remaining = Math.max(0, b.time + tf * 60 - (getNow() + 60));
    $("chartReplayCountdown").hidden = !prefs.countdown;
    $("chartReplayCountdown").textContent =
      "Replay " +
      Math.floor(remaining / 60)
        .toString()
        .padStart(2, "0") +
      ":" +
      (remaining % 60).toString().padStart(2, "0");
    $("chartPriceBadge").hidden = !(
      prefs.symbolLabelValue === "price" &&
      ["percentage", "indexed"].includes(prefs.scale) &&
      ["both", "value"].includes(prefs.symbolLabels)
    );
    $("chartPriceBadge").textContent = formatPrice(b.close);
  }
  function decorations() {
    for (const line of decorationLines) series.removePriceLine(line);
    decorationLines = [];
    const bars = getBars();
    if (!bars.length) return;
    const add = (p: any, display: any, title: any, color: any, style = 2) => {
      if (display === "hidden" || !Number.isFinite(p)) return;
      decorationLines.push(
        series.createPriceLine({
          price: p,
          lineVisible: ["both", "line"].includes(display),
          axisLabelVisible: ["both", "value"].includes(display),
          color,
          lineStyle: style,
          lineWidth: 1,
          title,
        }),
      );
    };
    if (prefs.previousDayClose !== "hidden") {
      const day = dayKey(bars.at(-1).time + 21600),
        old = bars.findLast((b) => dayKey(b.time + 21600) < day);
      if (old)
        add(
          old.close,
          prefs.previousDayClose,
          "Previous close",
          settingsColor(prefs, "previousDayColor"),
          prefs.previousDayStyle,
        );
    }
    if (prefs.highLow !== "hidden") {
      const r = chart.timeScale().getVisibleLogicalRange?.(),
        visible = r
          ? bars.slice(
              Math.max(0, Math.floor(r.from)),
              Math.min(bars.length, Math.ceil(r.to) + 1),
            )
          : bars;
      if (visible.length) {
        add(
          visible.reduce((m, b) => Math.max(m, b.high), -Infinity),
          prefs.highLow,
          "High",
          settingsColor(prefs, "highColor"),
        );
        add(
          visible.reduce((m, b) => Math.min(m, b.low), Infinity),
          prefs.highLow,
          "Low",
          settingsColor(prefs, "lowColor"),
        );
      }
    }
  }
  function refresh() {
    syncScope();
    const bars: any = getBars();
    series.setData(
      bars.map((b, i) => {
        const up =
          prefs.previousCloseColors && i
            ? b.close >= bars[i - 1].close
            : b.close >= b.open;
        return {
          ...b,
          color: prefs.body
            ? up
              ? settingsColor(prefs, "up")
              : settingsColor(prefs, "down")
            : "rgba(0,0,0,0)",
          borderColor: settingsColor(prefs, up ? "borderUp" : "borderDown"),
          wickColor: settingsColor(prefs, up ? "wickUp" : "wickDown"),
        };
      }),
    );
    if (prefs.sma) sma.setData(indicatorValues(bars, prefs.smaPeriod, "sma"));
    else sma.setData([]);
    if (prefs.ema) ema.setData(indicatorValues(bars, prefs.emaPeriod, "ema"));
    else ema.setData([]);
    volume.setData(
      bars.map((b) => ({
        time: b.time,
        value: b.volume || 0,
        color: settingsColor(
          {
            ...prefs,
            colorOpacity: { ...prefs.colorOpacity, wickUp: 22, wickDown: 22 },
          },
          b.close >= b.open ? "wickUp" : "wickDown",
        ),
      })),
    );
    updateLegend(bars.at(-1));
    decorations();
    drawingWorkspace.refresh();
    schedule();
  }
  function updateSettings(part: any) {
    Object.assign(prefs, sanitizeSettings({ ...prefs, ...part }));
    persist();
    apply();
  }
  function resetView() {
    drawingWorkspace.cancel();
    prefs.autoScale = true;
    apply();
    const n = getBars().length;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-3, n - 90),
      to: n + prefs.marginRight,
    });
  }
  settings = createChartSettings({
    prefs,
    apply,
    commit: (baseline, current) =>
      baseline?.session !== current.session && onSessionCommit
        ? onSessionCommit(current.session)
        : true,
    pause,
    toast,
  });
  document
    .querySelectorAll<HTMLElement>("[data-scale-mode]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          updateSettings(
            b.dataset.scaleMode === "auto"
              ? { autoScale: !prefs.autoScale }
              : { scale: prefs.scale === "log" ? "normal" : "log" },
          )),
    );
  document.querySelectorAll<HTMLElement>("[data-nav]").forEach(
    (b) =>
      (b.onclick = () => {
        const range = chart.timeScale().getVisibleLogicalRange?.();
        if (b.dataset.nav === "reset") {
          resetView();
          return;
        }
        if (!range) return;
        const span = range.to - range.from,
          center = (range.to + range.from) / 2;
        if (["in", "out"].includes(b.dataset.nav)) {
          const width = span * (b.dataset.nav === "in" ? 0.8 : 1.25);
          chart.timeScale().setVisibleLogicalRange({
            from: center - width / 2,
            to: center + width / 2,
          });
        } else {
          const delta = span * 0.3 * (b.dataset.nav === "left" ? -1 : 1);
          chart.timeScale().setVisibleLogicalRange({
            from: range.from + delta,
            to: range.to + delta,
          });
        }
      }),
  );
  $("chartPaneButton").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (container.requestFullscreen) await container.requestFullscreen();
      else throw Error("Fullscreen is unavailable.");
    } catch {
      toast(translate("Браузер не разрешил полноэкранный режим."));
    }
  };
  let plusPrice = null;
  container.addEventListener("pointermove", (e) => {
    const r = container.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top,
      left = chart.priceScale("left").width?.() || 0,
      right = chart.priceScale("right").width?.() || 0,
      inAxis =
        prefs.scalePlacement === "left"
          ? x < left
          : x > container.clientWidth - right;
    $("chartAxisPlus").hidden =
      !prefs.plusButton ||
      !inAxis ||
      y > container.clientHeight - chart.timeScale().height();
    if (!$("chartAxisPlus").hidden) {
      plusPrice = series.coordinateToPrice(y);
      $("chartAxisPlus").style.top = Math.max(0, y - 10) + "px";
      $("chartAxisPlus").style[
        prefs.scalePlacement === "left" ? "left" : "right"
      ] = "4px";
      $("chartAxisPlus").style[
        prefs.scalePlacement === "left" ? "right" : "left"
      ] = "auto";
    }
  });
  $("chartAxisPlus").onclick = () => {
    if (Number.isFinite(plusPrice))
      drawingWorkspace.addLevel("primary", Math.round(plusPrice * 4) / 4);
  };
  container.addEventListener(
    "pointerleave",
    () => ($("chartAxisPlus").hidden = true),
  );
  new ResizeObserver(schedule).observe(container);
  drawingWorkspace.addPane({
    id: "primary",
    chart,
    series,
    container,
    getBars,
    getSymbol,
    getTimeframe,
    getLock: () => lockedTime,
    setLock: (value: any) => {
      lockedTime = value;
      apply();
    },
    applySettings: updateSettings,
    openSettings: () => settings.open(),
    resetView,
  });
  apply();
  drawingWorkspace.cancel();
  return {
    freezeViewport: () => viewportScales.forEach((scale) => scale.freeze()),
    releaseViewport,
    refresh,
    preferences: prefs,
    updatePreferences: updateSettings,
    updateLegend,
    restoreDrawings: drawingWorkspace.restoreDrawings,
    cancel: () => {
      const locked = lockedTime;
      lockedTime = null;
      drawingWorkspace.cancel();
      if (locked) apply();
    },
    openSettings: () => settings.open(),
    resetView,
    get lockedTime() {
      return lockedTime;
    },
  };
}
