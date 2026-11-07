import { element as $ } from "./dom";
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
      .filter(
        (d) =>
          d &&
          ["level", "ray", "trend", "zone"].includes(d.type) &&
          typeof d.id === "string" &&
          Number.isFinite(d.createdAt) &&
          [d.a, d.b || d.a].every(
            (p) =>
              p &&
              Number.isFinite(p.time) &&
              Number.isFinite(p.price) &&
              p.price > 0,
          ) &&
          /^#[\da-f]{6}$/i.test(d.color) &&
          Number.isFinite(d.width) &&
          d.width >= 1 &&
          d.width <= 4 &&
          Number.isFinite(d.opacity) &&
          d.opacity >= 0 &&
          d.opacity <= 100,
      )
      .slice(-500)
      .map((d) => ({
        id: d.id,
        type: d.type,
        createdAt: d.createdAt,
        a: { time: d.a.time, price: d.a.price },
        b: d.b ? { time: d.b.time, price: d.b.price } : null,
        color: d.color,
        width: d.width,
        opacity: d.opacity,
        dashed: !!d.dashed,
        hidden: !!d.hidden,
      }));
  }
  function saveDrawings() {
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
      handleScale:
        mode === "cursor"
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
    const a = coordinates(d.a),
      b = coordinates(d.b || d.a);
    if (a.x === null || a.y === null || b.x === null || b.y === null) return;
    const width = Math.max(
      0,
      container.clientWidth - (chart.priceScale("right").width?.() || 60),
    );
    const style = {
      stroke: d.color,
      "stroke-width": d.width,
      "stroke-dasharray": d.dashed ? "6 4" : "none",
      fill: "none",
    };
    if (d.type === "level")
      group.append(
        node("line", {
          ...style,
          x1: chart.priceScale("left").width?.() || 0,
          y1: a.y,
          x2: width,
          y2: a.y,
        }),
      );
    if (d.type === "ray")
      group.append(
        node("line", { ...style, x1: a.x, y1: a.y, x2: width, y2: a.y }),
      );
    if (d.type === "trend")
      group.append(
        node("line", { ...style, x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
      );
    if (d.type === "zone") {
      group.append(
        node("rect", {
          ...style,
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.max(1, Math.abs(b.x - a.x)),
          height: Math.max(1, Math.abs(b.y - a.y)),
          fill: d.color,
          "fill-opacity": d.opacity / 100,
        }),
      );
      group.append(
        node("line", {
          ...style,
          "stroke-dasharray": "5 4",
          x1: Math.min(a.x, b.x),
          y1: (a.y + b.y) / 2,
          x2: Math.max(a.x, b.x),
          y2: (a.y + b.y) / 2,
        }),
      );
    }
    if (isSelected)
      for (const p of d.type === "level" || d.type === "ray" ? [a] : [a, b])
        group.append(
          node("circle", {
            cx: p.x,
            cy: p.y,
            r: 4,
            fill: prefs.background,
            stroke: d.color,
            "stroke-width": 2,
          }),
        );
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
      if (d.createdAt <= getNow() && !d.hidden)
        plot(preview?.id === d.id ? preview : d, group, d.id === selected);
    if (anchor && hover)
      plot(
        {
          type: mode,
          a: anchor,
          b: hover,
          color: prefs.drawingColor,
          width: prefs.drawingWidth,
          dashed: true,
          opacity: prefs.zoneOpacity,
        },
        group,
      );
    $("drawingCount").textContent = drawings.filter(
      (d) => d.createdAt <= getNow(),
    ).length;
    $("drawDelete").disabled = !selected;
    $("drawUndo").disabled = !drawings.some((d) => d.createdAt <= getNow());
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
    return { time, price: Math.round(price * 4) / 4 };
  }
  function selectMode(value: any) {
    mode = value;
    anchor = null;
    hover = null;
    selected = null;
    preview = null;
    dragging = false;
    chart.applyOptions({
      handleScroll: value === "cursor",
      handleScale:
        value === "cursor"
          ? {
              axisPressedMouseMove: { time: true, price: !prefs.lockRatio },
              axisDoubleClickReset: { time: true, price: !prefs.lockRatio },
              mouseWheel: true,
              pinch: true,
            }
          : false,
    });
    container.classList.toggle("drawing-mode", value !== "cursor");
    document.querySelectorAll<HTMLElement>("[data-draw]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.draw === value);
      b.setAttribute("aria-pressed", String(b.dataset.draw === value));
    });
    const hints = {
      cursor: "Перемещение и масштаб · разметка сохраняется",
      select: "Выберите объект, затем перетащите или удалите",
      level: "Нажмите на нужную цену",
      ray: "Нажмите на начало горизонтального луча",
      trend: "Выберите две точки линии",
      zone: "Выберите два угла зоны",
    };
    $("drawingHint").textContent = hints[value];
    schedule();
  }
  function near(d: any, x: any, y: any) {
    const a = coordinates(d.a),
      b = coordinates(d.b || d.a);
    if (a.x === null || a.y === null || b.x === null || b.y === null)
      return Infinity;
    if (d.type === "level") return Math.abs(y - a.y);
    if (d.type === "ray") return x >= a.x - 6 ? Math.abs(y - a.y) : Infinity;
    if (d.type === "zone") {
      const xmin = Math.min(a.x, b.x),
        xmax = Math.max(a.x, b.x),
        ymin = Math.min(a.y, b.y),
        ymax = Math.max(a.y, b.y);
      if (x >= xmin - 6 && x <= xmax + 6 && y >= ymin - 6 && y <= ymax + 6)
        return 0;
      return Infinity;
    }
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy,
      t = length
        ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
        : 0;
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  }
  chart.subscribeClick((param) => {
    if (!param.point || mode === "cursor" || mode === "select") return;
    pause();
    const p = point(
      param.point.x + (chart.priceScale("left").width?.() || 0),
      param.point.y,
    );
    if (!p) return;
    if (["trend", "zone"].includes(mode) && !anchor) {
      anchor = p;
      hover = p;
      $("drawingHint").textContent =
        mode === "zone"
          ? "Теперь выберите противоположный угол · Esc — отмена"
          : "Теперь выберите вторую точку · Esc — отмена";
      schedule();
      return;
    }
    if (drawings.length >= 500) {
      toast("Достигнут предел: 500 объектов. Удалите ненужную разметку.");
      return;
    }
    drawings.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      type: mode,
      a: anchor || p,
      b: anchor ? p : null,
      createdAt: getNow(),
      color: prefs.drawingColor,
      width: prefs.drawingWidth,
      dashed: prefs.drawingDashed,
      opacity: prefs.zoneOpacity,
    });
    saveDrawings();
    selectMode("cursor");
  });
  container.addEventListener("pointerdown", (e) => {
    if (mode !== "select") return;
    pause();
    const rect = container.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      p = point(x, y);
    let best = null,
      distance = 9;
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
    selected = best?.id || null;
    if (best && p) {
      dragging = true;
      dragStart = p;
      preview = structuredClone(best);
      container.setPointerCapture(e.pointerId);
    }
    schedule();
  });
  container.addEventListener("pointermove", (e) => {
    const rect = container.getBoundingClientRect(),
      p: any = point(e.clientX - rect.left, e.clientY - rect.top);
    if (anchor) hover = p;
    if (dragging && preview && p) {
      const original: any = drawings.find((d) => d.id === selected),
        dt: any = p.time - dragStart.time,
        dp = p.price - dragStart.price;
      preview.a = { time: original.a.time + dt, price: original.a.price + dp };
      if (original.b)
        preview.b = {
          time: original.b.time + dt,
          price: original.b.price + dp,
        };
    }
    schedule();
  });
  container.addEventListener("pointerup", () => {
    if (dragging && preview) {
      preview.createdAt = getNow();
      drawings = drawings.map((d) => (d.id === selected ? preview : d));
      saveDrawings();
    }
    dragging = false;
    preview = null;
    schedule();
  });
  container.addEventListener("pointercancel", () => {
    dragging = false;
    preview = null;
    schedule();
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
    if (!selected) return;
    drawings = drawings.filter((d) => d.id !== selected);
    selected = null;
    saveDrawings();
    schedule();
  }
  $("drawDelete").onclick = removeSelected;
  $("drawUndo").onclick = () => {
    const last = drawings.findLastIndex((d) => d.createdAt <= getNow());
    if (last >= 0) {
      drawings.splice(last, 1);
      selected = null;
      saveDrawings();
      schedule();
    }
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
      document.querySelector<HTMLDialogElement>("dialog[open]") ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    if (e.code === "Escape") selectMode("cursor");
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
    chart
      .timeScale()
      .setVisibleLogicalRange({
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
      if (
        !d ||
        !["level", "ray", "trend", "zone"].includes(d.type) ||
        ![d.a, d.b || d.a].every(
          (p) =>
            p &&
            Number.isFinite(p.time) &&
            Number.isFinite(p.price) &&
            p.price > 0,
        ) ||
        !/^#[a-f0-9]{6}$/i.test(d.color) ||
        !Number.isFinite(d.width) ||
        d.width < 1 ||
        d.width > 4 ||
        !Number.isFinite(d.opacity) ||
        d.opacity < 0 ||
        d.opacity > 100
      )
        throw Error("Некорректный объект разметки.");
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
          chart
            .timeScale()
            .setVisibleLogicalRange({
              from: center - width / 2,
              to: center + width / 2,
            });
        } else {
          const delta = span * 0.3 * (b.dataset.nav === "left" ? -1 : 1);
          chart
            .timeScale()
            .setVisibleLogicalRange({
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
