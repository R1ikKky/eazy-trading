import { t as translate, tr } from "../i18n/language";
import { element as $ } from "./dom";
import {
  drawingTool,
  isDrawingType,
  NAVIGATION_TOOLS,
} from "./drawing-catalog";
import { sanitizeDrawing } from "./drawing-schema";
import { renderDrawing } from "./drawing-renderer";
import { createDrawingToolbar } from "./drawing-toolbar";
import { createChartMenu } from "./chart-menu";

/** One toolbar targets the focused chart; stored drawings belong to instruments. */
export function createDrawingWorkspace({
  getPreferences,
  getNow,
  getScope,
  getSessionSymbol,
  onChange,
  onDrawingsChange,
  onActiveChange,
  pause,
  toast,
}: any) {
  const ns = "http://www.w3.org/2000/svg",
    contexts: any[] = [];
  let active: any = null,
    chart: any,
    series: any,
    container: any,
    svg: any,
    getBars: any = () => [],
    getTimeframe: any = () => 1,
    prefs: any = getPreferences();
  let mode = "cursor",
    anchor: any = null,
    hover: any = null,
    scope = "",
    drawings: any[] = [],
    selected: any = null,
    frame = 0,
    dragging = false,
    preview: any = null,
    dragStart: any = null;
  let pending: any[] = [],
    strokePoints: any[] = [],
    dragHandle = -1,
    selectionPointer: number | null = null,
    lastSaved: any[] = [];
  let controlHeld = false,
    manualMagnet = false,
    lastPointer: { x: number; y: number } | null = null;
  const histories = new Map<string, any[][]>();
  const symbolOf = (d: any) => d.symbol || getSessionSymbol();
  const isPosition = (type: string) =>
    type === "long-position" || type === "short-position";
  const belongs = (d: any, ctx = active) =>
    !!ctx && symbolOf(d) === ctx.getSymbol();
  const history = () => {
    const symbol = active?.getSymbol() || getSessionSymbol();
    if (!histories.has(symbol)) histories.set(symbol, []);
    return histories.get(symbol)!;
  };
  function bind(ctx: any) {
    chart = ctx.chart;
    series = ctx.series;
    container = ctx.container;
    svg = ctx.svg;
    getBars = ctx.getBars;
    getTimeframe = ctx.getTimeframe;
    prefs = getPreferences();
  }
  const drawingUI = createDrawingToolbar({
    selectTool: (id) => {
      pause();
      selectMode(id);
    },
    toast,
    magnet: (enabled) => {
      manualMagnet = enabled;
      syncMagnet();
      schedule();
    },
    style: (style) => {
      Object.assign(prefs, {
        drawingColor: style.color,
        drawingWidth: style.width,
        zoneOpacity: style.opacity,
        drawingDashed: style.dashed,
      });
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
  function syncMagnet() {
    const drawing = isDrawingType(mode) || (mode === "select" && dragging);
    drawingUI.setMagnet(
      Boolean(
        active &&
        drawing &&
        location.pathname === "/replay" &&
        !document.querySelector("dialog[open]") &&
        (controlHeld || manualMagnet),
      ),
    );
    if (active && lastPointer && drawing)
      hover = point(lastPointer.x, lastPointer.y);
  }
  function updateControl(held: boolean) {
    controlHeld = held;
    syncMagnet();
    schedule();
  }
  document.addEventListener("keydown", (event) => {
    if (
      location.pathname !== "/replay" ||
      document.querySelector("dialog[open]") ||
      (event.target as HTMLElement).closest(
        "input, textarea, select, [contenteditable='true']",
      )
    )
      return;
    updateControl(event.ctrlKey);
  });
  document.addEventListener("keyup", (event) => updateControl(event.ctrlKey));
  window.addEventListener("blur", () => updateControl(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) updateControl(false);
  });
  window.addEventListener("workspace-route", () => {
    manualMagnet = false;
    updateControl(false);
  });
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
  function cleanDrawings(value: any) {
    return (Array.isArray(value) ? value : [])
      .map(sanitizeDrawing)
      .filter(Boolean)
      .slice(-500);
  }
  function saveDrawings(record = true) {
    if (
      record &&
      JSON.stringify(lastSaved.filter((d) => belongs(d))) !==
        JSON.stringify(drawings.filter((d) => belongs(d)))
    ) {
      history().push(structuredClone(lastSaved.filter((d) => belongs(d))));
      if (history().length > 40) history().shift();
    }
    lastSaved = structuredClone(drawings);
    try {
      localStorage.setItem(
        "eazy-trading-drawings:" + scope,
        JSON.stringify(drawings),
      );
    } catch {
      toast(translate("Не удалось сохранить разметку в браузере."));
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
        localStorage.getItem("eazy-trading-drawings:" + scope) || "[]",
      );
    } catch {
      drawings = [];
    }
    drawings = cleanDrawings(drawings);
    lastSaved = structuredClone(drawings);
    histories.clear();
    pending = [];
    strokePoints = [];
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
    syncScope();
    const target = active;
    for (const ctx of contexts) {
      bind(ctx);
      svg.replaceChildren();
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) continue;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const left = chart.priceScale("left").width?.() || 0,
        right = chart.priceScale("right").width?.() || 0;
      const clipId = "drawing-plot-clip-" + ctx.id,
        defs = node("defs", {}),
        clip = node("clipPath", { id: clipId });
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
      const group = node("g", { "clip-path": `url(#${clipId})` });
      svg.append(group);
      if (!drawingUI.state.hidden)
        for (const d of drawings)
          if (belongs(d, ctx) && d.createdAt <= getNow() && !d.hidden)
            plot(
              ctx === target && preview?.id === d.id ? preview : d,
              group,
              ctx === target && d.id === selected,
            );
      const lock = ctx.getLock?.();
      if (lock) {
        const x = xAt(lock);
        if (x !== null)
          group.append(
            node("line", {
              x1: x + left,
              x2: x + left,
              y1: 0,
              y2: h,
              stroke: prefs.crosshairColor,
              "stroke-width": 1,
              "stroke-dasharray": "5 5",
            }),
          );
      }
      const magnetCursor =
        ctx === target && drawingUI.state.magnet && !!hover && !!lastPointer;
      ctx.container.classList.toggle("drawing-magnet-cursor", magnetCursor);
      if (magnetCursor) {
        const cursor = coordinates(hover);
        if (cursor.x != null && cursor.y != null) {
          const crosshair = node("g", {
            "data-magnet-crosshair": "true",
            "data-time": hover.time,
            "data-price": hover.price,
            "data-x": cursor.x,
            "data-y": cursor.y,
            stroke: prefs.crosshairColor,
            "stroke-width": 1,
            "pointer-events": "none",
          });
          if (prefs.crosshair) {
            crosshair.append(
              node("line", {
                x1: left,
                x2: w - right,
                y1: cursor.y,
                y2: cursor.y,
                "stroke-dasharray": "4 4",
              }),
              node("line", {
                x1: cursor.x,
                x2: cursor.x,
                y1: 0,
                y2: h - chart.timeScale().height(),
                "stroke-dasharray": "4 4",
              }),
            );
          }
          crosshair.append(
            node("path", {
              d: `M${cursor.x - 6} ${cursor.y}h12M${cursor.x} ${cursor.y - 6}v12`,
              "stroke-width": 1.5,
            }),
          );
          group.append(crosshair);
        }
      }
      if (ctx === target) {
        const points =
          isPosition(mode) && hover
            ? positionPoints(hover)
            : strokePoints.length
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
              text: translate("Текст"),
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
      }
    }
    if (target) bind(target);
    $("drawingCount").textContent = String(
      drawings.filter((d) => belongs(d) && d.createdAt <= getNow()).length,
    );
    $("drawDelete").disabled =
      !selected ||
      drawingUI.state.locked ||
      !!drawings.find((d) => d.id === selected)?.locked;
    if (!selected) drawingUI.closeStyle();
    $("drawUndo").disabled = !active || !history().length;
    $("drawClear").disabled = !drawings.some((d) => belongs(d));
  }
  function point(x: any, y: any) {
    const logical = chart
        .timeScale()
        .coordinateToLogical(x - (chart.priceScale("left").width?.() || 0)),
      price = series.coordinateToPrice(y),
      bars = getBars();
    if (logical === null || price === null || !bars.length) return null;
    const i = Math.round(logical),
      minutes = getTimeframe();
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
      "bars-pattern": [
        translate("Начало копируемого участка"),
        translate("Конец участка"),
        translate("Куда перенести"),
      ],
      curve: [
        translate("Начало"),
        translate("Контрольная точка"),
        translate("Конец"),
      ],
      "double-curve": [
        translate("Начало"),
        translate("Первая контрольная точка"),
        translate("Вторая контрольная точка"),
        translate("Конец"),
      ],
    };
    const name = steps[type]?.[index] || tool?.labels?.[index];
    return tr`${name ? name + " · " : ""}точка ${index + 1}${tool?.points > 0 ? translate(" из ") + tool.points : translate(" · Enter — завершить")}`;
  }
  function positionPoints(entry: any) {
    // Size the initial 1:1 box for the current zoom, then store only time/price anchors.
    const location = coordinates(entry),
      plotWidth = container.clientWidth - (chart.priceScale("right").width?.() || 0),
      plotHeight = container.clientHeight - chart.timeScale().height(),
      distance = Math.min(80, Math.max(40, plotHeight * 0.12)),
      offsetPrice = series.coordinateToPrice(location.y + distance),
      risk = Math.min(
        entry.price - 0.25,
        Math.max(0.25, Math.round(Math.abs(entry.price - offsetPrice) * 4) / 4),
      ),
      width = Math.min(180, Math.max(80, plotWidth * 0.3)),
      endX = location.x + width <= plotWidth - 8
        ? location.x + width
        : location.x - width,
      endTime = point(endX, location.y)?.time || entry.time + getTimeframe() * 60 * 20,
      direction = mode === "long-position" ? 1 : -1;
    return [
      entry,
      { time: endTime, price: entry.price - direction * risk },
      { time: endTime, price: entry.price + direction * risk },
    ];
  }
  function selectMode(value: any) {
    mode = value;
    selectionPointer = null;
    drawingUI.closeStyle();
    pending = [];
    strokePoints = [];
    drawingUI.setActive(value);
    anchor = null;
    hover = null;
    selected = null;
    preview = null;
    dragging = false;
    lastPointer = null;
    if (!isDrawingType(value)) manualMagnet = false;
    syncMagnet();
    if (!active) return;
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
          visible: prefs.crosshair && value === "cursor" && !active.getLock?.(),
          labelVisible:
            prefs.crosshair && value === "cursor" && !active.getLock?.(),
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
        ? translate(
            "Выберите объект · тяните точку или весь объект · Delete — удалить",
          )
        : value === "eraser"
          ? translate("Нажмите или проведите по объекту, чтобы удалить")
          : tool?.points === -1
            ? translate("Удерживайте кнопку и рисуйте")
            : NAVIGATION_TOOLS.includes(value)
              ? translate("Перемещение и масштаб")
              : tool?.points === 0
                ? translate(
                    "Расставьте точки · Enter или двойной клик — завершить · Esc — отмена",
                  )
                : isPosition(value)
                  ? `${tool.name} · ${translate("Вход")} · R:R 1:1 · Esc — ${translate("Отмена")}`
                  : tr`${tool?.name || value} · ${pointInstruction(value, 0)} · Esc — отмена`;
    schedule();
  }
  function near(d: any, x: any, y: any) {
    const layer = svg.querySelector(`[data-drawing-id="${CSS.escape(d.id)}"]`);
    if (!layer) return Infinity;
    let distance = Infinity;
    for (const element of (
      layer as SVGGElement
    ).querySelectorAll<SVGGeometryElement>(
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
    for (const text of (layer as SVGGElement).querySelectorAll<SVGTextElement>(
      "text",
    )) {
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
      .filter((d) => belongs(d) && d.createdAt <= getNow() && !d.hidden)
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
      drawingUI.setMagnet(false);
      schedule();
      text =
        (await drawingUI.text(
          type === "sign" ? "★" : type === "flag" ? translate("Флаг") : "",
        )) || undefined;
      if (scope !== originalScope) return;
      if (!text) {
        selectMode("cursor");
        return;
      }
    }
    if (drawings.length >= 500) {
      toast(translate("Достигнут предел: 500 объектов."));
      return;
    }
    const d = sanitizeDrawing({
      id: Date.now() + "-" + Math.random().toString(36).slice(2),
      type,
      symbol: active.getSymbol(),
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
      toast(translate("Проверьте точки разметки."));
      return;
    }
    drawings.push(d);
    saveDrawings();
    pending = [];
    strokePoints = [];
    anchor = null;
    hover = null;
    selectMode("cursor");
    if (isPosition(type)) {
      selectMode("select");
      selected = d.id;
      drawingUI.setStyle(d);
    }
    schedule();
  }
  function recordPoint(p: any) {
    pause();
    if (pending.at(-1)?.time === p.time && pending.at(-1)?.price === p.price)
      return;
    if (pending.length >= 256) {
      toast(translate("Максимум 256 точек. Нажмите Enter, чтобы завершить."));
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
        tr`${tool.name} · ${pointInstruction(mode, pending.length)} · Esc — отмена`;
    schedule();
  }
  const pointerdown = (e) => {
    if (
      (e.target as Element).closest(".drawing-ui, button, input, select, a") ||
      e.button !== 0
    )
      return;
    updateControl(e.ctrlKey);
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
    const navigating = NAVIGATION_TOOLS.includes(mode);
    const best = navigating || mode === "select" ? hit(x, y) : null;
    if (navigating && best) selectMode("select");
    if (mode !== "select") {
      if (isPosition(mode)) {
        pause();
        e.preventDefault();
        void finishDrawing(positionPoints(p));
      } else if (!NAVIGATION_TOOLS.includes(mode)) recordPoint(p);
      return;
    }
    if (!best) {
      selectMode("cursor");
      schedule();
      return;
    }
    e.preventDefault();
    selectionPointer = e.pointerId;
    pause();
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
        syncMagnet();
        dragStart = point(x, y) || p;
      }
    }
    schedule();
  };
  const pointermove = (e) => {
    if ((e.target as Element).closest(".drawing-ui")) return;
    updateControl(e.ctrlKey);
    const rect = container.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      p: any = point(x, y);
    if (!p) return;
    lastPointer = { x, y };
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
  };
  const pointerup = (event: PointerEvent) => {
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
    if (selectionPointer === event.pointerId && selected && mode === "select") {
      const original = drawings.find((d) => d.id === selected);
      const changed =
        dragging &&
        preview &&
        JSON.stringify(preview) !== JSON.stringify(original);
      if (changed) {
        preview.createdAt = getNow();
        const clean = sanitizeDrawing(preview);
        if (clean) {
          drawings = drawings.map((d) => (d.id === selected ? clean : d));
          saveDrawings();
        }
      } else if (original) {
        drawingUI.editStyle(
          event.clientX,
          event.clientY,
          drawingUI.state.locked || original.locked,
        );
      }
    }
    selectionPointer = null;
    dragging = false;
    preview = null;
    dragHandle = -1;
    syncMagnet();
    schedule();
  };
  const pointercancel = () => {
    selectionPointer = null;
    dragging = false;
    preview = null;
    strokePoints = [];
    syncMagnet();
    schedule();
  };
  const dblclick = (event) => {
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
  };
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
  document.addEventListener("keydown", (e) => {
    if (!active) return;
    if (
      location.pathname !== "/replay" ||
      document.querySelector<HTMLDialogElement>("dialog[open]") ||
      (e.target as HTMLElement).closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
      )
    )
      return;
    if (
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.code === "KeyZ"
    ) {
      e.preventDefault();
      undoDrawing();
      return;
    }
    if (e.code === "Escape") {
      selectMode("cursor");
      return;
    }
    if (["BUTTON", "A"].includes((e.target as HTMLElement).tagName)) return;
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

  $("drawDelete").onclick = removeSelected;
  function undoDrawing() {
    if (!active) return;
    if (pending.length || strokePoints.length || dragging) {
      selectMode(mode);
      schedule();
      return;
    }
    const previous = history().pop();
    if (!previous) return;
    drawings = drawings.filter((d) => !belongs(d)).concat(previous);
    selected = null;
    saveDrawings(false);
    schedule();
  }
  $("drawUndo").onclick = undoDrawing;
  $("drawClear").onclick = () => {
    if (!active) return;
    if (
      confirm(
        translate("Удалить всю разметку для этой истории ") +
          active.getSymbol() +
          "?",
      )
    ) {
      drawings = drawings.filter((d) => !belongs(d));
      selected = null;
      saveDrawings();
      schedule();
    }
  };
  function activate(ctx: any) {
    if (active === ctx) return;
    if (active) {
      active.chart.applyOptions({
        handleScroll: true,
        handleScale: true,
        crosshair: {
          vertLine: {
            visible: prefs.crosshair && !active.getLock?.(),
            labelVisible: prefs.crosshair && !active.getLock?.(),
          },
          horzLine: { visible: prefs.crosshair, labelVisible: prefs.crosshair },
        },
      });
      active.container.classList.remove(
        "drawing-mode",
        "drawing-magnet-cursor",
      );
    }
    for (const item of contexts) if (item !== ctx) item.menu?.close();
    active = ctx;
    bind(ctx);
    for (const item of contexts)
      item.pane.classList.toggle("is-active-chart", item === ctx);
    $("chartPanes").dataset.activeChart = ctx.id;
    selectMode(mode);
    onActiveChange?.(ctx.id);
    schedule();
  }
  function addPane(ctx: any) {
    ctx.svg = document.createElementNS(ns, "svg");
    ctx.svg.classList.add("chart-drawings");
    ctx.svg.setAttribute("aria-hidden", "true");
    ctx.container.append(ctx.svg);
    ctx.pane = ctx.container.closest(".chart-pane");
    contexts.push(ctx);
    ctx.pane.addEventListener("pointerdown", () => activate(ctx), true);
    ctx.pane.addEventListener("focusin", () => activate(ctx));
    ctx.container.addEventListener("contextmenu", () => activate(ctx), true);
    for (const [name, handler] of Object.entries({
      pointerdown,
      pointermove,
      pointerup,
      pointercancel,
      pointerleave: () => {
        if (!dragging && !strokePoints.length) {
          lastPointer = null;
          hover = null;
          schedule();
        }
      },
      dblclick,
    }))
      ctx.container.addEventListener(name, (event: any) => {
        if (active === ctx) (handler as any)(event);
      });
    ctx.container.addEventListener("wheel", schedule, { passive: true });
    ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
    new ResizeObserver(schedule).observe(ctx.container);
    let lock: any = null;
    if (!ctx.getLock) ctx.getLock = () => lock;
    if (!ctx.setLock)
      ctx.setLock = (time: any) => {
        lock = time;
        ctx.chart.applyOptions({
          crosshair: {
            vertLine: {
              visible: prefs.crosshair && !lock,
              labelVisible: prefs.crosshair && !lock,
            },
          },
        });
      };
    const menu = createChartMenu({
      chart: ctx.chart,
      idSuffix: ctx.id === "primary" ? "" : "-" + ctx.id,
      isActive: () => active === ctx,
      series: ctx.series,
      container: ctx.container,
      prefs: getPreferences(),
      getBars: ctx.getBars,
      getSymbol: ctx.getSymbol,
      getNow,
      getDrawings: () => drawings.filter((d) => belongs(d, ctx)),
      changeDrawing: (id: any, change: any) => {
        activate(ctx);
        drawings = change.remove
          ? drawings.filter((d) => d.id !== id)
          : drawings.map((d) =>
              d.id === id ? { ...d, ...change, createdAt: getNow() } : d,
            );
        saveDrawings();
        schedule();
      },
      removeDrawings: () => {
        activate(ctx);
        drawings = drawings.filter(
          (d) => !belongs(d) || d.createdAt > getNow(),
        );
        selected = null;
        saveDrawings();
        schedule();
      },
      selectDrawing: (id: any) => {
        activate(ctx);
        selectMode("select");
        selected = id;
        schedule();
      },
      pasteDrawing: (value: any, symbol: any) => {
        activate(ctx);
        if (symbol !== ctx.getSymbol())
          throw Error(translate("Объект относится к другому инструменту."));
        const clean = sanitizeDrawing(value);
        if (!clean) throw Error(translate("Некорректный объект разметки."));
        if (drawings.length >= 500)
          throw Error(translate("Достигнут предел: 500 объектов."));
        drawings.push({
          ...clean,
          id: crypto.randomUUID(),
          symbol: ctx.getSymbol(),
          createdAt: getNow(),
          hidden: false,
        });
        saveDrawings();
        schedule();
      },
      createLevel: (price: any) => addLevel(ctx.id, price),
      getLock: () => (ctx.getLock ? ctx.getLock() : lock),
      setLock: (time: any) => {
        if (ctx.setLock) ctx.setLock(time);
        else lock = time;
        ctx.getLock ||= () => lock;
        schedule();
      },
      applySettings: (value: any) => ctx.applySettings(value),
      openSettings: () => ctx.openSettings(),
      resetView: () => {
        activate(ctx);
        selectMode("cursor");
        ctx.resetView();
      },
      pause,
      toast,
    });
    ctx.menu = menu;
    if (!active) activate(ctx);
    return { refresh: schedule, activate: () => activate(ctx) };
  }
  function addLevel(id: string, price: number) {
    const ctx = contexts.find((c) => c.id === id);
    if (!ctx) return;
    activate(ctx);
    const bars = getBars();
    if (!bars.length) return;
    if (drawings.length >= 500) {
      toast(translate("Достигнут предел: 500 объектов."));
      return;
    }
    drawings.push({
      id: crypto.randomUUID(),
      type: "level",
      symbol: ctx.getSymbol(),
      a: { time: bars.at(-1).time, price },
      b: null,
      createdAt: getNow(),
      color: prefs.drawingColor,
      width: prefs.drawingWidth,
      dashed: prefs.drawingDashed,
      opacity: prefs.zoneOpacity,
    });
    saveDrawings();
    schedule();
  }
  return {
    addLevel,
    isNavigation: (id: string) =>
      active?.id !== id || NAVIGATION_TOOLS.includes(mode),
    addPane,
    refresh: schedule,
    activate: (id: string) => {
      const ctx = contexts.find((c) => c.id === id);
      if (ctx) activate(ctx);
    },
    get activeId() {
      return active?.id;
    },
    get activeTimeframe() {
      return active?.getTimeframe() || 1;
    },
    restoreDrawings(value: any) {
      scope = getScope();
      drawings = cleanDrawings(value);
      lastSaved = structuredClone(drawings);
      histories.clear();
      pending = [];
      strokePoints = [];
      selected = null;
      preview = null;
      schedule();
    },
    cancel() {
      pending = [];
      strokePoints = [];
      selected = null;
      preview = null;
      if (active) selectMode("cursor");
      contexts.forEach((ctx) => {
        if (ctx.getLock?.()) ctx.setLock?.(null);
        ctx.menu.close();
      });
    },
    setMode: selectMode,
  };
}
