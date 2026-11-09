import { element as $ } from "./dom";
import { drawingTool, NAVIGATION_TOOLS } from "./drawing-catalog";
import { sanitizeDrawing } from "./drawing-schema";
import { renderDrawing } from "./drawing-renderer";
import { createDrawingToolbar } from "./drawing-toolbar";
import {
  defaults,
  presets,
  loadSettings,
  settingsColor,
  chartDate,
  isRegularSession,
  isExtendedSession,
  sanitizeSettings,
} from "./settings-model";
import { dayKey } from "./engine";
import { createChartSettings } from "./chart-settings";
import { createChartMenu } from "./chart-menu";
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
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.classList.add("chart-drawings");
  svg.setAttribute("aria-hidden", "true");
  container.append(svg);
  let mode = "cursor",
    anchor: any = null,
    hover: any = null,
    scope = "",
    drawings: any = [],
    selected: any = null,
    frame = 0,
    dragging: any = false,
    preview: any = null,
    dragStart: any = null,
    lockedTime: any = null,
    decorationLines = [],
    menu,
    settings;
  let pending: any[] = [],
    strokePoints: any[] = [],
    dragHandle = -1;
  let undoStack: any[][] = [],
    lastSaved: any[] = [];
  const drawingUI = createDrawingToolbar({
    selectTool: (id) => {
      pause();
      selectMode(id);
    },
    toast,
    style: (style) => {
      Object.assign(prefs, {
        drawingColor: style.color,
        drawingWidth: style.width,
        zoneOpacity: style.opacity,
        drawingDashed: style.dashed,
      });
      persist();
      onChange?.(prefs);
      if (
        selected &&
        !drawingUI.state.locked &&
        !drawings.find((d) => d.id === selected)?.locked
      ) {
        drawings = drawings.map((d) =>
          d.id === selected ? { ...d, ...style, createdAt: getNow() } : d,
        );
        saveDrawings();
      }
      schedule();
    },
  });
  drawingUI.setStyle({
    color: prefs.drawingColor,
    width: prefs.drawingWidth,
    opacity: prefs.zoneOpacity,
    dashed: prefs.drawingDashed,
  });
  window.addEventListener("drawing-ui-change", schedule);
  function node(tag: any, attrs: any) {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries<any>(attrs))
      n.setAttribute(k, String(v));
    return n;
  }
  function schedule() {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
  }
  function persist() {
    try {
      localStorage.setItem("replay-lab-chart-v3", JSON.stringify(prefs));
    } catch {
      toast(
        "Браузер не разрешил сохранить настройки. Они действуют до перезагрузки.",
      );
    }
  }
  function cleanDrawings(value: any) {
    return (Array.isArray(value) ? value : [])
      .map(sanitizeDrawing)
      .filter(Boolean)
      .slice(-500);
  }
  function saveDrawings(record = true) {
    if (record && JSON.stringify(lastSaved) !== JSON.stringify(drawings)) {
      undoStack.push(structuredClone(lastSaved));
      if (undoStack.length > 40) undoStack.shift();
    }
    lastSaved = structuredClone(drawings);
    try {
      localStorage.setItem(
        "replay-lab-drawings:" + scope,
        JSON.stringify(drawings),
      );
    } catch {
      toast("Не удалось сохранить разметку в браузере.");
    }
    onDrawingsChange?.(structuredClone(drawings));
  }
  function syncScope() {
    const next = getScope();
    if (next === scope) return;
    scope = next;
    anchor = null;
    selected = null;
    preview = null;
    try {
      drawings = JSON.parse(
        localStorage.getItem("replay-lab-drawings:" + scope) || "[]",
      );
    } catch {
      drawings = [];
    }
    drawings = cleanDrawings(drawings);
    lastSaved = structuredClone(drawings);
    undoStack = [];
    pending = [];
    strokePoints = [];
  }
  const overlay = document.createElement("div");
  overlay.className = "chart-overlays";
  overlay.innerHTML =
    '<div id="chartWatermark" class="chart-watermark" aria-hidden="true"></div><div id="chartScaleModes" class="chart-scale-modes"><button type="button" data-scale-mode="auto" title="Automatic price scale">A</button><button type="button" data-scale-mode="log" title="Logarithmic price scale">L</button></div><div id="chartNavigation" class="chart-navigation"><button type="button" data-nav="out" aria-label="Zoom out">−</button><button type="button" data-nav="in" aria-label="Zoom in">＋</button><button type="button" data-nav="left" aria-label="Move chart left">‹</button><button type="button" data-nav="right" aria-label="Move chart right">›</button><button type="button" data-nav="reset" aria-label="Reset chart view">↶</button></div><button id="chartPaneButton" class="chart-pane-button" title="Fullscreen chart" aria-label="Fullscreen chart">⛶</button><button id="chartAxisPlus" class="chart-axis-plus" aria-label="Add horizontal level at cursor" title="Add price level" hidden>＋</button><div id="chartReplayCountdown" class="chart-countdown" hidden></div><div id="chartPriceBadge" class="chart-price-badge" hidden></div>';
  container.append(overlay);
  const description = () =>
    $("symbol").value === "NQ" ? "E-mini Nasdaq-100" : "E-mini S&P 500";
  const decimal = () =>
    prefs.precision === "default" ? 2 : Number(prefs.precision);
  const formatPrice = (v: any) =>
    Number(v).toLocaleString("en-US", {
      minimumFractionDigits: decimal(),
      maximumFractionDigits: decimal(),
    });
  function apply() {
    const background =
      prefs.backgroundType === "gradient"
        ? {
            type: "gradient",
            topColor: settingsColor(prefs, "background"),
            bottomColor: settingsColor(prefs, "backgroundBottom"),
          }
        : { type: "solid", color: settingsColor(prefs, "background") };
    const clock = new Intl.DateTimeFormat("en-US", {
      timeZone: prefs.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: prefs.hoursFormat === "12",
    });
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
        barSpacing: prefs.barSpacing,
        rightOffset: prefs.marginRight,
        borderColor: line,
        borderVisible: (prefs.colorOpacity.scaleLines ?? 100) > 0,
        tickMarkFormatter: (t, type) =>
          type <= 2
            ? chartDate(t, prefs, true)
            : clock.format(new Date(t * 1000)),
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
      autoscaleInfoProvider: (base) => {
        const info = base();
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
        return {
          ...info,
          priceRange: {
            minValue: Math.max(0.25, center - span / 2),
            maxValue: center + span / 2,
          },
        };
      },
    });
    chart.applyOptions({
      handleScale: NAVIGATION_TOOLS.includes(mode)
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
      autoscaleInfoProvider: (base) => (prefs.lockRatio ? null : base()),
    });
    ema.applyOptions({
      visible: prefs.ema,
      color: settingsColor(prefs, "emaColor"),
      priceScaleId: priceScale,
      title: "EMA " + prefs.emaPeriod,
      autoscaleInfoProvider: (base) => (prefs.lockRatio ? null : base()),
    });
    $("chartWatermark").hidden = prefs.watermark === "hidden";
    $("chartWatermark").textContent =
      prefs.watermark === "description" ? description() : $("symbol").value;
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
    if (!b) return;
    $("statusTitle").hidden = !prefs.title;
    $("statusTitle").textContent =
      prefs.titleType === "description"
        ? description()
        : prefs.titleType === "both"
          ? $("symbol").value + " · " + description()
          : b.contract || $("symbol").value;
    $("ohlc").hidden = !prefs.chartValues;
    $("lastPrice").hidden = !prefs.chartValues;
    $("marketOpenStatus").hidden = !prefs.marketStatus;
    const open =
      prefs.session === "rth"
        ? isRegularSession(b.time)
        : isExtendedSession(b.time);
    $("marketOpenStatus").classList.toggle("closed", !open);
    $("marketOpenStatus").title =
      "Историческая сессия: " + (open ? "рынок открыт" : "рынок закрыт");
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
    legend.style.background = prefs.statusBackground
      ? settingsColor(
          {
            ...prefs,
            colorOpacity: {
              ...prefs.colorOpacity,
              background: prefs.statusOpacity,
            },
          },
          "background",
        )
      : "transparent";
    legend.style.color = settingsColor(prefs, "text");
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
    menu?.refresh();
    schedule();
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
    const minutes =
      Number(
        document.querySelector<HTMLInputElement>("[data-tf].selected")?.dataset
          .tf,
      ) || 1;
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
  function coordinates(p: any) {
    const x = xAt(p.time);
    return {
      x: x === null ? null : x + (chart.priceScale("left").width?.() || 0),
      y: series.priceToCoordinate(p.price),
    };
  }
  function plot(d: any, group: any, isSelected = false) {
    const layer = node("g", d.id ? { "data-drawing-id": d.id } : {});
    group.append(layer);
    renderDrawing(d, layer, {
      node,
      coordinates,
      bars: getBars(),
      now: getNow(),
      background: prefs.background,
      left: chart.priceScale("left").width?.() || 0,
      width: Math.max(
        0,
        container.clientWidth - (chart.priceScale("right").width?.() || 0),
      ),
      height: Math.max(0, container.clientHeight - chart.timeScale().height()),
    });
    if (isSelected && !drawingUI.state.locked && !d.locked) {
      for (const p of d.points || [d.a, ...(d.b ? [d.b] : [])]) {
        const c = coordinates(p);
        if (c.x != null && c.y != null)
          layer.append(
            node("circle", {
              cx: c.x,
              cy: c.y,
              r: 4,
              fill: prefs.background,
              stroke: d.color,
              "stroke-width": 2,
            }),
          );
      }
    }
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
    for (const d of drawings)
      if (d.createdAt <= getNow() && !d.hidden && !drawingUI.state.hidden)
        plot(preview?.id === d.id ? preview : d, group, d.id === selected);
    const points = strokePoints.length
      ? strokePoints
      : pending.length && hover
        ? [...pending, hover]
        : [];
    if (points.length)
      plot(
        {
          type: mode,
          a: points[0],
          b: points[1] || points[0],
          points,
          color: prefs.drawingColor,
          width: prefs.drawingWidth,
          dashed: !strokePoints.length,
          opacity: prefs.zoneOpacity,
          text: "Текст",
        },
        group,
      );
    if (mode === "dot" && hover) {
      const p = coordinates(hover);
      if (p.x != null && p.y != null)
        group.append(
          node("circle", {
            cx: p.x,
            cy: p.y,
            r: 3,
            fill: prefs.crosshairColor,
          }),
        );
    }
    $("drawingCount").textContent = drawings.filter(
      (d) => d.createdAt <= getNow(),
    ).length;
    $("drawDelete").disabled =
      !selected ||
      drawingUI.state.locked ||
      !!drawings.find((d) => d.id === selected)?.locked;
    $("drawUndo").disabled = !undoStack.length;
    $("drawClear").disabled = !drawings.length;
  }
  function point(x: any, y: any) {
    const logical = chart
        .timeScale()
        .coordinateToLogical(x - (chart.priceScale("left").width?.() || 0)),
      price = series.coordinateToPrice(y),
      bars = getBars();
    if (logical === null || price === null || !bars.length) return null;
    const i = Math.round(logical),
      minutes =
        Number(
          document.querySelector<HTMLInputElement>("[data-tf].selected")
            ?.dataset.tf,
        ) || 1;
    const time =
      i < 0
        ? bars[0].time + i * minutes * 60
        : i >= bars.length
          ? bars.at(-1).time + (i - bars.length + 1) * minutes * 60
          : bars[i].time;
    const bar = bars[i];
    const snapped =
      drawingUI.state.magnet && bar
        ? [bar.open, bar.high, bar.low, bar.close].reduce(
            (best, value) =>
              Math.abs(value - price) < Math.abs(best - price) ? value : best,
            bar.close,
          )
        : price;
    if (time <= 0 || snapped <= 0) return null;
    return { time, price: Math.max(0.25, Math.round(snapped * 4) / 4) };
  }
  function pointInstruction(type: string, index: number) {
    const tool = drawingTool(type);
    const steps: Record<string, string[]> = {
      "long-position": ["Вход", "Стоп ниже входа", "Цель выше входа"],
      "short-position": ["Вход", "Стоп выше входа", "Цель ниже входа"],
      "bars-pattern": [
        "Начало копируемого участка",
        "Конец участка",
        "Куда перенести",
      ],
      curve: ["Начало", "Контрольная точка", "Конец"],
      "double-curve": [
        "Начало",
        "Первая контрольная точка",
        "Вторая контрольная точка",
        "Конец",
      ],
    };
    const name = steps[type]?.[index] || tool?.labels?.[index];
    return `${name ? name + " · " : ""}точка ${index + 1}${tool?.points > 0 ? " из " + tool.points : " · Enter — завершить"}`;
  }
  function selectMode(value: any) {
    mode = value;
    pending = [];
    strokePoints = [];
    drawingUI.setActive(value);
    anchor = null;
    hover = null;
    selected = null;
    preview = null;
    dragging = false;
    chart.applyOptions({
      handleScroll: NAVIGATION_TOOLS.includes(value),
      handleScale: NAVIGATION_TOOLS.includes(value)
        ? {
            axisPressedMouseMove: { time: true, price: !prefs.lockRatio },
            axisDoubleClickReset: { time: true, price: !prefs.lockRatio },
            mouseWheel: true,
            pinch: true,
          }
        : false,
    });
    container.classList.toggle(
      "drawing-mode",
      !NAVIGATION_TOOLS.includes(value),
    );
    container.style.cursor =
      value === "arrow-cursor"
        ? "default"
        : value === "eraser"
          ? "cell"
          : "crosshair";
    chart.applyOptions({
      crosshair: {
        vertLine: {
          visible: prefs.crosshair && value === "cursor",
          labelVisible: prefs.crosshair && value === "cursor",
        },
        horzLine: {
          visible: prefs.crosshair && value === "cursor",
          labelVisible: prefs.crosshair && value === "cursor",
        },
      },
    });
    document.querySelectorAll<HTMLElement>("[data-draw]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.draw === value);
      b.setAttribute("aria-pressed", String(b.dataset.draw === value));
    });
    const tool = drawingTool(value);
    $("drawingHint").textContent =
      value === "select"
        ? "Выберите объект · тяните точку или весь объект · Delete — удалить"
        : value === "eraser"
          ? "Нажмите или проведите по объекту, чтобы удалить"
          : tool?.points === -1
            ? "Удерживайте кнопку и рисуйте"
            : NAVIGATION_TOOLS.includes(value)
              ? "Перемещение и масштаб"
              : tool?.points === 0
                ? "Расставьте точки · Enter или двойной клик — завершить · Esc — отмена"
                : `${tool?.name || value} · ${pointInstruction(value, 0)} · Esc — отмена`;
    schedule();
  }
  function near(d: any, x: any, y: any) {
    const layer = svg.querySelector(`[data-drawing-id="${CSS.escape(d.id)}"]`);
    if (!layer) return Infinity;
    let distance = Infinity;
    for (const element of layer.querySelectorAll<SVGGeometryElement>(
      "path,line,rect,circle,ellipse,polyline,polygon",
    )) {
      try {
        if (
          element.getAttribute("fill") !== "none" &&
          element.isPointInFill(new DOMPoint(x, y))
        )
          return 0;
        const length = element.getTotalLength(),
          n = Math.min(250, Math.max(2, Math.ceil(length / 5)));
        for (let i = 0; i <= n; i++) {
          const p = element.getPointAtLength((length * i) / n);
          distance = Math.min(distance, Math.hypot(x - p.x, y - p.y));
        }
      } catch {}
    }
    for (const text of layer.querySelectorAll<SVGTextElement>("text")) {
      const box = text.getBBox();
      if (
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height
      )
        return 0;
    }
    return distance;
  }
  function hit(x: number, y: number) {
    let best: any = null,
      distance = 9;
    if (drawingUI.state.hidden) return null;
    for (const d of drawings
      .filter((d) => d.createdAt <= getNow() && !d.hidden)
      .slice()
      .reverse()) {
      const n = near(d, x, y);
      if (n < distance) {
        best = d;
        distance = n;
      }
    }
    return best;
  }
  function setPoints(d: any, points: any[]) {
    d.points = points;
    d.a = points[0];
    d.b = points[1] || null;
    return d;
  }
  async function finishDrawing(points: any[], type = mode) {
    const tool = drawingTool(type);
    if (
      !tool ||
      (points.length < Math.max(2, tool.points) && tool.points !== 1)
    )
      return;
    const originalScope = scope;
    let text: string | undefined;
    if (tool.kind === "text") {
      pending = [];
      hover = null;
      schedule();
      text =
        (await drawingUI.text(
          type === "sign" ? "★" : type === "flag" ? "Флаг" : "",
        )) || undefined;
      if (scope !== originalScope) return;
      if (!text) {
        selectMode("cursor");
        return;
      }
    }
    if (drawings.length >= 500) {
      toast("Достигнут предел: 500 объектов.");
      return;
    }
    const d = sanitizeDrawing({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      type,
      points,
      a: points[0],
      b: points[1] || null,
      createdAt: getNow(),
      color: prefs.drawingColor,
      width: prefs.drawingWidth,
      dashed: prefs.drawingDashed,
      opacity: prefs.zoneOpacity,
      ...(text !== undefined ? { text } : {}),
    });
    if (!d) {
      toast("Проверьте точки разметки.");
      return;
    }
    drawings.push(d);
    saveDrawings();
    pending = [];
    strokePoints = [];
    anchor = null;
    hover = null;
    if (!drawingUI.state.repeat) selectMode("cursor");
    else selectMode(type);
    schedule();
  }
  function recordPoint(p: any) {
    pause();
    if (pending.at(-1)?.time === p.time && pending.at(-1)?.price === p.price)
      return;
    if (pending.length >= 256) {
      toast("Максимум 256 точек. Нажмите Enter, чтобы завершить.");
      return;
    }
    pending.push(p);
    anchor = pending[0];
    hover = p;
    const tool = drawingTool(mode)!;
    if (tool.points > 0 && pending.length >= tool.points)
      void finishDrawing([...pending]);
    else
      $("drawingHint").textContent =
        `${tool.name} · ${pointInstruction(mode, pending.length)} · Esc — отмена`;
    schedule();
  }
  container.addEventListener("pointerdown", (e) => {
    if (
      (e.target as Element).closest(".drawing-ui, button, input, select, a") ||
      e.button !== 0
    )
      return;
    const rect = container.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      p = point(x, y);
    if (
      !p ||
      x > container.clientWidth - (chart.priceScale("right").width?.() || 0) ||
      y > container.clientHeight - chart.timeScale().height()
    )
      return;
    if (["brush", "marker", "demo"].includes(mode)) {
      pause();
      strokePoints = [p];
      container.setPointerCapture(e.pointerId);
      e.preventDefault();
      schedule();
      return;
    }
    if (mode === "eraser") {
      pause();
      const d = hit(x, y);
      if (d && !drawingUI.state.locked && !d.locked) {
        drawings = drawings.filter((v) => v.id !== d.id);
        saveDrawings();
        schedule();
      }
      return;
    }
    if (mode !== "select") {
      if (!NAVIGATION_TOOLS.includes(mode)) recordPoint(p);
      return;
    }
    pause();
    const best = hit(x, y);
    selected = best?.id || null;
    dragHandle = -1;
    if (best) {
      drawingUI.setStyle(best);
      if (!drawingUI.state.locked && !best.locked) {
        const points = best.points || [best.a, ...(best.b ? [best.b] : [])];
        dragHandle = points.findIndex((v) => {
          const c = coordinates(v);
          return (
            c.x != null && c.y != null && Math.hypot(c.x - x, c.y - y) < 10
          );
        });
        dragging = true;
        dragStart = p;
        preview = structuredClone(best);
        container.setPointerCapture(e.pointerId);
      }
    }
    schedule();
  });
  container.addEventListener("pointermove", (e) => {
    if ((e.target as Element).closest(".drawing-ui")) return;
    const rect = container.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      p: any = point(x, y);
    if (!p) return;
    hover = p;
    if (strokePoints.length && e.buttons & 1) {
      const last = coordinates(strokePoints.at(-1));
      if (
        Math.hypot(last.x - x, last.y - y) > 2 &&
        (strokePoints.at(-1).time !== p.time ||
          strokePoints.at(-1).price !== p.price)
      ) {
        if (strokePoints.length >= 256)
          strokePoints = strokePoints.filter((_, i) => i % 2 === 0);
        strokePoints.push(p);
      }
    }
    if (mode === "eraser" && e.buttons & 1 && !drawingUI.state.locked) {
      const d = hit(x, y);
      if (d && !d.locked) {
        drawings = drawings.filter((v) => v.id !== d.id);
        saveDrawings();
      }
    }
    if (dragging && preview) {
      const original = drawings.find((d) => d.id === selected);
      if (original) {
        const dt = p.time - dragStart.time,
          dp = p.price - dragStart.price,
          points = original.points || [
            original.a,
            ...(original.b ? [original.b] : []),
          ];
        setPoints(
          preview,
          points.map((v, i) =>
            dragHandle >= 0
              ? i === dragHandle
                ? p
                : v
              : { time: v.time + dt, price: v.price + dp },
          ),
        );
      }
    }
    schedule();
  });
  container.addEventListener("pointerup", () => {
    if (strokePoints.length) {
      const points = [...strokePoints],
        type = mode;
      if (type === "demo") {
        const stroke = strokePoints;
        setTimeout(() => {
          if (strokePoints === stroke) strokePoints = [];
          schedule();
        }, 600);
      } else {
        strokePoints = [];
        void finishDrawing(points, type);
      }
    }
    if (dragging && preview) {
      preview.createdAt = getNow();
      const clean = sanitizeDrawing(preview);
      if (clean) {
        drawings = drawings.map((d) => (d.id === selected ? clean : d));
        saveDrawings();
      }
    }
    dragging = false;
    preview = null;
    dragHandle = -1;
    schedule();
  });
  container.addEventListener("pointercancel", () => {
    dragging = false;
    preview = null;
    strokePoints = [];
    schedule();
  });
  container.addEventListener("dblclick", (event) => {
    if ((event.target as Element).closest(".drawing-ui")) return;
    if (["path", "polyline"].includes(mode) && pending.length >= 2) {
      event.preventDefault();
      void finishDrawing([...pending]);
    } else if (mode === "select" && selected && !drawingUI.state.locked) {
      const d = drawings.find((value) => value.id === selected);
      if (!d?.locked && drawingTool(d?.type)?.kind === "text")
        void drawingUI.text(d.text).then((text) => {
          if (text) {
            d.text = text;
            d.createdAt = getNow();
            saveDrawings();
            schedule();
          }
        });
    }
  });
  container.addEventListener("wheel", schedule, { passive: true });
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    decorations();
    schedule();
  });
  new ResizeObserver(schedule).observe(container);
  document.querySelectorAll<HTMLElement>("[data-draw]").forEach(
    (b) =>
      (b.onclick = () => {
        pause();
        selectMode(b.dataset.draw);
      }),
  );
  function removeSelected() {
    if (
      !selected ||
      drawingUI.state.locked ||
      drawings.find((d) => d.id === selected)?.locked
    )
      return;
    drawings = drawings.filter((d) => d.id !== selected);
    selected = null;
    saveDrawings();
    schedule();
  }
  $("drawDelete").onclick = removeSelected;
  $("drawUndo").onclick = () => {
    const previous = undoStack.pop();
    if (!previous) return;
    drawings = previous;
    selected = null;
    saveDrawings(false);
    schedule();
  };
  $("drawClear").onclick = () => {
    if (
      confirm(
        "Удалить всю разметку для этой истории " + $("symbol").value + "?",
      )
    ) {
      drawings = [];
      selected = null;
      saveDrawings();
      schedule();
    }
  };
  document.addEventListener("keydown", (e) => {
    if (
      location.pathname !== "/replay" ||
      document.querySelector<HTMLDialogElement>("dialog[open]") ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    if (e.code === "Escape") selectMode("cursor");
    if (
      e.code === "Enter" &&
      ["path", "polyline"].includes(mode) &&
      pending.length >= 2
    ) {
      e.preventDefault();
      void finishDrawing([...pending]);
    }
    if (
      ["Delete", "Backspace"].includes(e.code) &&
      mode === "select" &&
      selected
    ) {
      e.preventDefault();
      removeSelected();
    }
  });
  function addDrawing(d: any) {
    if (drawings.length >= 500) throw Error("Достигнут предел: 500 объектов.");
    drawings.push(d);
    saveDrawings();
    schedule();
  }
  function createLevel(price: any) {
    const bars = getBars();
    if (!bars.length) throw Error("Сначала раскройте свечу.");
    addDrawing({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      type: "level",
      a: { time: bars.at(-1).time, price },
      b: null,
      createdAt: getNow(),
      color: prefs.drawingColor,
      width: prefs.drawingWidth,
      dashed: prefs.drawingDashed,
      opacity: prefs.zoneOpacity,
    });
  }
  function updateSettings(part: any) {
    Object.assign(prefs, sanitizeSettings({ ...prefs, ...part }));
    persist();
    apply();
  }
  function resetView() {
    selectMode("cursor");
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
  menu = createChartMenu({
    chart,
    series,
    container,
    prefs,
    getBars,
    getNow,
    getDrawings: () => drawings,
    changeDrawing: (id, change) => {
      if (change.remove) drawings = drawings.filter((d) => d.id !== id);
      else
        drawings = drawings.map((d) =>
          d.id === id ? { ...d, ...change, createdAt: getNow() } : d,
        );
      saveDrawings();
      schedule();
    },
    removeDrawings: () => {
      drawings = drawings.filter((d) => d.createdAt > getNow());
      selected = null;
      saveDrawings();
      schedule();
    },
    selectDrawing: (id) => {
      selectMode("select");
      selected = id;
      schedule();
    },
    pasteDrawing: (d, symbol) => {
      if (symbol !== $("symbol").value)
        throw Error("Объект относится к другому инструменту.");
      const clean = sanitizeDrawing(d);
      if (!clean) throw Error("Некорректный объект разметки.");
      d = clean;
      addDrawing({
        ...d,
        id: Date.now() + "-" + Math.random().toString(36).slice(2),
        createdAt: getNow(),
        hidden: false,
      });
    },
    createLevel,
    getLock: () => lockedTime,
    setLock: (time) => {
      lockedTime = time;
      apply();
    },
    applySettings: updateSettings,
    openSettings: () => settings.open(),
    resetView,
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
      toast("Браузер не разрешил полноэкранный режим.");
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
    if (Number.isFinite(plusPrice)) createLevel(Math.round(plusPrice * 4) / 4);
  };
  container.addEventListener(
    "pointerleave",
    () => ($("chartAxisPlus").hidden = true),
  );
  apply();
  selectMode("cursor");
  return {
    refresh,
    preferences: prefs,
    updatePreferences: updateSettings,
    updateLegend,
    restoreDrawings: (value) => {
      scope = getScope();
      drawings = cleanDrawings(value);
      lastSaved = structuredClone(drawings);
      undoStack = [];
      pending = [];
      strokePoints = [];
      anchor = null;
      selected = null;
      preview = null;
      try {
        localStorage.setItem(
          "replay-lab-drawings:" + scope,
          JSON.stringify(drawings),
        );
      } catch {}
      schedule();
    },
    cancel: () => {
      const locked: any = lockedTime;
      lockedTime = null;
      selectMode("cursor");
      menu.close();
      if (locked) apply();
    },
    get lockedTime() {
      return lockedTime;
    },
  };
}
