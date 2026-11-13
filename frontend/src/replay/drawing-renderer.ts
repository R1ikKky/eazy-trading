import { tr, t as translate } from "../i18n/language";
import { drawingTool } from "./drawing-catalog";
import { positionMetrics, positionLabelLayout } from "./position-labels";
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];
export function anchoredVWAP(bars: any[], start: number, now: number) {
  let sum = 0,
    volume = 0,
    contract: string | undefined;
  return bars
    .filter((b) => b.time >= start && b.time <= now)
    .map((b) => {
      if (contract && b.contract && contract !== b.contract) {
        sum = 0;
        volume = 0;
      }
      contract = b.contract;
      const v = Math.max(0, Number(b.volume) || 0);
      sum += ((b.high + b.low + b.close) / 3) * v;
      volume += v;
      return {
        time: b.time,
        price: volume ? sum / volume : b.close,
        contract: b.contract,
      };
    });
}
export function barVolumeProfile(
  bars: any[],
  start: number,
  end: number,
  now: number,
  rows = 24,
) {
  const selected = bars.filter(
    (b) =>
      b.time >= Math.min(start, end) &&
      b.time <= Math.max(start, end) &&
      b.time <= now,
  );
  if (!selected.length) return [];
  const low = selected.reduce((min, b) => Math.min(min, b.low), Infinity),
    high = selected.reduce((max, b) => Math.max(max, b.high), -Infinity);
  const step = Math.max(0.25, (high - low) / rows),
    bins = Array.from(
      { length: Math.min(rows, Math.max(1, Math.ceil((high - low) / step))) },
      (_, i) => ({
        price: low + (i + 0.5) * step,
        volume: 0,
      }),
    );
  for (const b of selected)
    bins[
      Math.min(
        bins.length - 1,
        Math.max(0, Math.floor(((b.high + b.low + b.close) / 3 - low) / step)),
      )
    ].volume += Math.max(0, Number(b.volume) || 0);
  return bins;
}
/** Screen geometry is rebuilt from stored time/price anchors after pan/zoom. */
export function renderDrawing(d: any, group: SVGGElement, ctx: any) {
  const {
    node,
    coordinates,
    width: w,
    height: h,
    left = 0,
    bars = [],
    now = 0,
    background = "var(--canvas)",
  } = ctx;
  const source = d.points || [d.a, ...(d.b ? [d.b] : [])];
  const bPoint = source[1] || source[0],
    cPoint = source[2] || bPoint;
  const p = source.map(coordinates);
  if (
    !p.length ||
    p.some((v) => v.x == null || v.y == null || !Number.isFinite(v.x + v.y))
  )
    return;
  const a = p[0],
    b = p[1] || a,
    c = p[2] || b,
    e = p[3] || c;
  const stroke = {
    stroke: d.color,
    "stroke-width": d.width,
    "stroke-dasharray": d.dashed ? "6 4" : "none",
    fill: "none",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  };
  const add = (tag: string, attrs: any) => {
    const element = node(tag, attrs);
    group.append(element);
    return element;
  };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    extra: any = {},
  ) => add("line", { ...stroke, x1, y1, x2, y2, ...extra });
  const path = (value: string, extra: any = {}) =>
    add("path", { ...stroke, d: value, ...extra });
  const label = (x: number, y: number, value: string, size = 11) => {
    const t = add("text", {
      x,
      y,
      fill: d.color,
      "font-size": size,
      "font-family": "Manrope, Arial, sans-serif",
      "paint-order": "stroke",
      stroke: background,
      "stroke-width": 3,
      "stroke-linejoin": "round",
    });
    t.textContent = value;
    return t;
  };
  const poly = (points: any[], close = false, extra: any = {}) =>
    path(
      points.map((v, i) => `${i ? "L" : "M"}${v.x},${v.y}`).join(" ") +
        (close ? " Z" : ""),
      extra,
    );
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    extra: any = {},
  ) =>
    add("rect", {
      ...stroke,
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
      rx: 3,
      ...extra,
    });
  const arrow = (u: any, v: any) => {
    line(u.x, u.y, v.x, v.y);
    const angle = Math.atan2(v.y - u.y, v.x - u.x);
    poly([
      {
        x: v.x - 10 * Math.cos(angle - 0.45),
        y: v.y - 10 * Math.sin(angle - 0.45),
      },
      v,
      {
        x: v.x - 10 * Math.cos(angle + 0.45),
        y: v.y - 10 * Math.sin(angle + 0.45),
      },
    ]);
  };
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy) || 1;
  const priceDelta = (bPoint.price || source[0].price) - source[0].price;
  const priceLabel = () =>
    `${priceDelta >= 0 ? "+" : ""}${priceDelta.toFixed(2)} (${((100 * priceDelta) / source[0].price).toFixed(2)}%)`;
  const timeLabel = () => {
    const mins =
      Math.abs((bPoint.time || source[0].time) - source[0].time) / 60;
    return tr`${Math.round(mins)} мин`;
  };
  if (
    ["trend", "info-line", "angle", "trend-ray", "extended"].includes(d.type)
  ) {
    if (["trend-ray", "extended"].includes(d.type)) {
      const scale = (3 * Math.max(w, h)) / len;
      line(
        d.type === "extended" ? a.x - dx * scale : a.x,
        d.type === "extended" ? a.y - dy * scale : a.y,
        b.x + dx * scale,
        b.y + dy * scale,
      );
    } else line(a.x, a.y, b.x, b.y);
    if (d.type === "info-line")
      label(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2 - 10,
        `${priceLabel()} · ${timeLabel()}`,
      );
    if (d.type === "angle") {
      path(
        `M${a.x + 36},${a.y} A36 36 0 0 ${dy < 0 ? 0 : 1} ${a.x + (36 * dx) / len},${a.y + (36 * dy) / len}`,
      );
      label(
        a.x + 40,
        a.y - 8,
        tr`${((-Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}° · экран`,
      );
    }
    return;
  }
  if (d.type === "level" || d.type === "cross") {
    line(left, a.y, w, a.y);
    label(w - 90, a.y - 5, source[0].price.toFixed(2));
  }
  if (d.type === "vertical" || d.type === "cross") line(a.x, 0, a.x, h);
  if (d.type === "ray") {
    line(a.x, a.y, w, a.y);
    label(a.x + 8, a.y - 6, source[0].price.toFixed(2));
  }
  if (["level", "vertical", "cross", "ray"].includes(d.type)) return;
  if (d.type === "fib" || d.type === "fib-extension") {
    for (const ratio of FIB_LEVELS) {
      const y =
        d.type === "fib"
          ? b.y + (a.y - b.y) * ratio
          : c.y + (b.y - a.y) * ratio;
      const price =
        d.type === "fib"
          ? (bPoint.price ?? source[0].price) +
            (source[0].price - (bPoint.price ?? source[0].price)) * ratio
          : (cPoint.price || bPoint.price) + priceDelta * ratio;
      line(Math.min(a.x, b.x), y, Math.max(b.x, c.x, a.x + 100), y, {
        opacity: ratio === 0.618 || ratio === 1 ? 1 : 0.6,
      });
      label(
        Math.max(b.x, c.x, a.x + 100) + 5,
        y + 4,
        `${ratio} · ${Number(price).toFixed(2)}`,
        10,
      );
    }
    poly(p, false, { "stroke-dasharray": "4 4" });
    return;
  }
  if (d.type === "fib-channel") {
    const off = c.y - (a.y + ((c.x - a.x) * dy) / (dx || 1));
    for (const ratio of FIB_LEVELS) {
      line(a.x, a.y + off * ratio, b.x, b.y + off * ratio);
      label(b.x + 4, b.y + off * ratio, `${ratio}`, 10);
    }
    return;
  }
  if (d.type === "fib-time" || d.type === "fib-trend-time") {
    const start = d.type === "fib-time" ? a.x : c.x;
    for (const ratio of [0, 1, 2, 3, 5, 8, 13, 21]) {
      const x = start + dx * ratio;
      line(x, 0, x, h, { opacity: 0.6 });
      label(x + 4, 18, String(ratio));
    }
    return;
  }
  if (["fib-speed", "fib-fan"].includes(d.type)) {
    for (const ratio of [0.236, 0.382, 0.5, 0.618, 0.786, 1]) {
      const target =
        d.type === "fib-fan"
          ? { x: b.x + (c.x - b.x) * ratio, y: b.y + (c.y - b.y) * ratio }
          : { x: b.x, y: a.y + (b.y - a.y) * ratio };
      const scale =
        (3 * Math.max(w, h)) /
        Math.max(1, Math.hypot(target.x - a.x, target.y - a.y));
      line(
        a.x,
        a.y,
        a.x + (target.x - a.x) * scale,
        a.y + (target.y - a.y) * scale,
        { opacity: 0.7 },
      );
      label(target.x + 5, target.y, String(ratio), 10);
    }
    return;
  }
  if (["fib-circles", "fib-arcs", "fib-wedge"].includes(d.type)) {
    for (const ratio of [0.236, 0.382, 0.5, 0.618, 1, 1.618, 2.618]) {
      const r = Math.max(1, len * ratio);
      if (d.type === "fib-circles")
        add("circle", { ...stroke, cx: a.x, cy: a.y, r, opacity: 0.65 });
      else {
        const start = Math.atan2(dy, dx),
          end =
            d.type === "fib-wedge"
              ? Math.atan2(c.y - a.y, c.x - a.x)
              : start - Math.PI;
        const sweep = end > start ? 1 : 0;
        path(
          `M${a.x + r * Math.cos(start)},${a.y + r * Math.sin(start)} A${r} ${r} 0 0 ${sweep} ${a.x + r * Math.cos(end)},${a.y + r * Math.sin(end)}`,
          { opacity: 0.65 },
        );
      }
      label(a.x + r, a.y - 4, String(ratio), 10);
    }
    if (d.type === "fib-wedge") {
      line(a.x, a.y, b.x, b.y);
      line(a.x, a.y, c.x, c.y);
    }
    return;
  }
  if (d.type === "fib-spiral") {
    const start = Math.atan2(dy, dx),
      points = [];
    for (let i = 0; i <= 240; i++) {
      const angle = (i / 240) * Math.PI * 6,
        r =
          len *
          Math.exp(((angle - Math.PI * 4) * Math.log(1.618)) / (Math.PI / 2));
      if (r > Math.max(w, h) * 4) break;
      points.push({
        x: a.x + r * Math.cos(start + angle),
        y: a.y + r * Math.sin(start + angle),
      });
    }
    poly(points);
    return;
  }
  const tool = drawingTool(d.type);
  if (tool?.labels) {
    poly(p);
    if (
      ["xabcd", "cypher", "pattern-triangle", "elliott-triangle"].includes(
        d.type,
      )
    ) {
      if (p.length >= 3)
        poly([p[0], p[1], p[2]], true, { fill: d.color, "fill-opacity": 0.07 });
      if (p.length >= 5)
        poly([p[2], p[3], p[4]], true, { fill: d.color, "fill-opacity": 0.07 });
    }
    p.forEach((v, i) =>
      label(v.x + 5, v.y + (i % 2 ? 18 : -10), tool.labels![i] || ""),
    );
    if (["xabcd", "cypher", "abcd"].includes(d.type))
      for (let i = 2; i < p.length; i++) {
        const prev = Math.abs(source[i - 1].price - source[i - 2].price);
        if (prev)
          label(
            (p[i].x + p[i - 1].x) / 2,
            (p[i].y + p[i - 1].y) / 2,
            (Math.abs(source[i].price - source[i - 1].price) / prev).toFixed(3),
            10,
          );
      }
    if (d.type === "head-shoulders" && p.length >= 5)
      line(p[2].x, p[2].y, p[4].x, p[4].y, { "stroke-dasharray": "4 4" });
    return;
  }
  if (d.type === "long-position" || d.type === "short-position") {
    const boxLeft = Math.min(a.x, b.x, c.x),
      right = Math.max(boxLeft + 1, a.x, b.x, c.x),
      stop = b.y,
      target = c.y;
    rect(boxLeft, Math.min(a.y, stop), right - boxLeft, Math.abs(stop - a.y), {
      fill: "#d27c72",
      stroke: "#d27c72",
      "fill-opacity": 0.2,
      "data-position-zone": "stop",
    });
    rect(boxLeft, Math.min(a.y, target), right - boxLeft, Math.abs(target - a.y), {
      fill: "#81b39b",
      stroke: "#81b39b",
      "fill-opacity": 0.2,
      "data-position-zone": "target",
    });
    line(boxLeft, a.y, right, a.y, { "data-position-level": "entry" });
    if (!ctx.isSelected || source.length < 3) return;
    const metrics = positionMetrics({ ...d, points: source }, { ...ctx, capital: ctx.capital });
    const badges = positionLabelLayout(
      [
        { kind: "stop", y: stop, lines: metrics.stop, color: "#802c35" },
        { kind: "entry", y: a.y, lines: metrics.entry, color: metrics.pnl >= 0 ? "#145b4d" : "#802c35" },
        { kind: "target", y: target, lines: metrics.target, color: "#145b4d" },
      ],
      { left: boxLeft, right, width: w, height: h, plotLeft: left, measure: ctx.measureText },
    );
    for (const badge of badges) {
      const layer = add("g", { "data-position-label": badge.kind });
      layer.append(node("rect", {
        x: badge.x, y: badge.top, width: badge.width, height: badge.height, rx: 3,
        fill: badge.color, stroke: "#ffffff99", "stroke-width": 0.7,
      }));
      badge.lines.forEach((value: string, i: number) => {
        const text = node("text", {
          x: badge.x + badge.width / 2,
          y: badge.top + badge.padding + badge.fontSize + i * badge.lineHeight,
          fill: "#ffffff", "font-size": badge.fontSize,
          "font-family": "Manrope, Arial, sans-serif", "text-anchor": "middle",
        });
        text.textContent = value;
        layer.append(text);
      });
    }
    return;
  }
  if (d.type === "forecast" || d.type === "projection") {
    if (d.type === "projection") {
      poly([a, b, c], false, { "stroke-dasharray": "4 4" });
      const target = { x: c.x + dx, y: c.y + dy };
      arrow(c, target);
      label(
        target.x + 5,
        target.y,
        ((cPoint.price || source[0].price) + priceDelta).toFixed(2),
      );
    } else {
      arrow(a, b);
      arrow(b, c);
      label(c.x + 5, c.y - 8, translate("Сценарий"));
    }
    return;
  }
  if (d.type === "bars-pattern") {
    const known = bars
      .filter(
        (v) =>
          v.time <= now &&
          v.time >= Math.min(source[0].time, bPoint.time || source[0].time) &&
          v.time <= Math.max(source[0].time, bPoint.time || source[0].time),
      )
      .slice(0, 200);
    for (const bar of known) {
      const shift = (cPoint.price || source[0].price) - source[0].price,
        time = bar.time - source[0].time + (cPoint.time || source[0].time);
      const hi = coordinates({ time, price: bar.high + shift }),
        lo = coordinates({ time, price: bar.low + shift }),
        op = coordinates({ time, price: bar.open + shift }),
        cl = coordinates({ time, price: bar.close + shift });
      if ([hi, lo, op, cl].every((v) => v.x != null && v.y != null)) {
        line(hi.x, hi.y, lo.x, lo.y, { opacity: 0.6 });
        line(op.x - 3, op.y, op.x, op.y);
        line(cl.x, cl.y, cl.x + 3, cl.y);
      }
    }
    label(c.x, c.y - 15, translate("Копия баров · не прогноз"));
    return;
  }
  if (d.type === "vwap") {
    const segments: any[] = [];
    let last: string | undefined;
    for (const value of anchoredVWAP(bars, source[0].time, now)) {
      if (!segments.length || value.contract !== last) {
        segments.push([]);
        last = value.contract;
      }
      const v = coordinates(value);
      if (v.x != null && v.y != null) segments.at(-1).push(v);
    }
    for (const segment of segments) poly(segment);
    label(a.x + 5, a.y - 12, "Anchored VWAP · HLC3");
    return;
  }
  if (d.type === "volume-range" || d.type === "volume-anchor") {
    const end = d.type === "volume-anchor" ? now : bPoint.time || now,
      bins = barVolumeProfile(bars, source[0].time, end, now),
      max = Math.max(1, ...bins.map((v) => v.volume)),
      right = d.type === "volume-anchor" ? w - 8 : Math.max(a.x, b.x),
      span = Math.min(160, Math.max(45, Math.abs(b.x - a.x)));
    const poc = bins.reduce((best, v) => (v.volume > best.volume ? v : best), {
      volume: -1,
      price: 0,
    });
    for (const bin of bins) {
      if (!bin.volume) continue;
      const y = coordinates({ time: source[0].time, price: bin.price }).y;
      const next = coordinates({
        time: source[0].time,
        price: bin.price + (bins[1]?.price - bins[0]?.price || 0.25),
      }).y;
      if (y != null && next != null)
        rect(
          right - (span * bin.volume) / max,
          Math.min(y, next),
          (span * bin.volume) / max,
          Math.max(1, Math.abs(next - y) - 1),
          {
            fill: d.color,
            "fill-opacity": bin.price === poc.price ? 0.7 : 0.3,
            stroke: "none",
          },
        );
    }
    const py = coordinates({ time: source[0].time, price: poc.price }).y;
    if (py != null)
      line(Math.min(a.x, b.x), py, right, py, { "stroke-dasharray": "4 4" });
    label(right - span, a.y - 15, translate("Профиль OHLCV · оценка"));
    return;
  }
  if (
    ["price-range", "time-range", "date-price-range", "zone"].includes(d.type)
  ) {
    if (d.type === "price-range") {
      line(a.x, a.y, a.x, b.y);
      line(a.x - 6, a.y, a.x + 6, a.y);
      line(a.x - 6, b.y, a.x + 6, b.y);
      label(a.x + 10, (a.y + b.y) / 2, priceLabel());
    } else if (d.type === "time-range") {
      line(a.x, a.y, b.x, a.y);
      line(a.x, a.y - 6, a.x, a.y + 6);
      line(b.x, a.y - 6, b.x, a.y + 6);
      label((a.x + b.x) / 2, a.y - 10, timeLabel());
    } else {
      rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(dx), Math.abs(dy), {
        fill: d.color,
        "fill-opacity": d.opacity / 100,
      });
      if (d.type === "date-price-range")
        label(
          Math.min(a.x, b.x) + 8,
          Math.min(a.y, b.y) + 18,
          `${priceLabel()} · ${timeLabel()}`,
        );
    }
    return;
  }
  if (d.type === "rotated-rect") {
    const projection = ((c.x - a.x) * -dy + (c.y - a.y) * dx) / (len * len),
      off = { x: -dy * projection, y: dx * projection };
    poly(
      [
        a,
        b,
        { x: b.x + off.x, y: b.y + off.y },
        { x: a.x + off.x, y: a.y + off.y },
      ],
      true,
      { fill: d.color, "fill-opacity": d.opacity / 100 },
    );
    return;
  }
  if (d.type === "brush" || d.type === "marker" || d.type === "demo") {
    poly(p, false, {
      "stroke-width": d.type === "marker" ? Math.max(10, d.width * 5) : d.width,
      opacity: d.type === "marker" ? 0.28 : 1,
    });
    return;
  }
  if (d.type === "path" || d.type === "polyline") {
    poly(p);
    if (d.type === "path" && p.length > 1) arrow(p.at(-2), p.at(-1));
    return;
  }
  if (d.type === "circle") {
    add("circle", {
      ...stroke,
      cx: a.x,
      cy: a.y,
      r: len,
      fill: d.color,
      "fill-opacity": d.opacity / 100,
    });
    return;
  }
  if (d.type === "ellipse") {
    add("ellipse", {
      ...stroke,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      rx: Math.max(1, Math.abs(dx) / 2),
      ry: Math.max(1, Math.abs(dy) / 2),
      fill: d.color,
      "fill-opacity": d.opacity / 100,
    });
    return;
  }
  if (d.type === "triangle") {
    poly([a, b, c], true, { fill: d.color, "fill-opacity": d.opacity / 100 });
    return;
  }
  if (d.type === "curve") {
    path(`M${a.x},${a.y} Q${b.x},${b.y} ${c.x},${c.y}`);
    return;
  }
  if (d.type === "double-curve") {
    path(`M${a.x},${a.y} C${b.x},${b.y} ${c.x},${c.y} ${e.x},${e.y}`);
    return;
  }
  if (d.type === "arc" || d.type === "sector") {
    const vx = b.x - a.x,
      vy = b.y - a.y,
      wx = c.x - a.x,
      wy = c.y - a.y,
      det = 2 * (vx * wy - vy * wx);
    if (Math.abs(det) < 0.01) {
      poly([a, b, c]);
      return;
    }
    const x = a.x + ((vx * vx + vy * vy) * wy - (wx * wx + wy * wy) * vy) / det,
      y = a.y + (vx * (wx * wx + wy * wy) - wx * (vx * vx + vy * vy)) / det,
      r = Math.hypot(x - a.x, y - a.y);
    const sweep =
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 0 ? 1 : 0;
    const start = Math.atan2(a.y - y, a.x - x),
      end = Math.atan2(c.y - y, c.x - x);
    const turn =
        ((sweep ? end - start : start - end) + Math.PI * 2) % (Math.PI * 2),
      large = turn > Math.PI ? 1 : 0;
    path(
      `${d.type === "sector" ? `M${x},${y} L` : `M`}${a.x},${a.y} A${r} ${r} 0 ${large} ${sweep} ${c.x},${c.y}${d.type === "sector" ? " Z" : ""}`,
      d.type === "sector"
        ? { fill: d.color, "fill-opacity": d.opacity / 100 }
        : {},
    );
    return;
  }
  if (d.type === "arrow" || d.type === "pointer-arrow") {
    arrow(a, b);
    return;
  }
  if (d.type === "arrow-up" || d.type === "arrow-down") {
    const sign = d.type === "arrow-up" ? -1 : 1;
    arrow({ x: a.x, y: a.y - sign * 28 }, a);
    return;
  }
  if (tool?.kind === "text" || d.type === "price-tag") {
    const origin = d.type === "callout" ? b : a;
    const text =
      d.type === "price-tag"
        ? source[0].price.toFixed(2)
        : d.type === "price-note"
          ? `${source[0].price.toFixed(2)} · ${d.text || ""}`
          : d.text || "";
    const lines = text.split("\n").slice(0, 12),
      width = Math.min(
        280,
        Math.max(50, ...lines.map((v) => v.length * 7 + 20)),
      ),
      height = lines.length * 18 + 16;
    if (d.type === "callout") line(a.x, a.y, b.x, b.y);
    if (d.type !== "text")
      rect(origin.x, origin.y - height, width, height, {
        fill: background,
        "fill-opacity": 0.96,
      });
    if (d.type !== "table")
      lines.forEach((value, i) =>
        label(origin.x + 8, origin.y - height + 21 + i * 18, value, 12),
      );
    else {
      const cols = Math.max(...lines.map((v) => v.split("|").length));
      lines.forEach((row, i) =>
        row
          .split("|")
          .forEach((cell, j) =>
            label(
              origin.x + 6 + (j * width) / cols,
              origin.y - height + 21 + i * 18,
              cell.trim(),
              11,
            ),
          ),
      );
    }
    if (d.type === "table") {
      const cols = Math.max(...lines.map((v) => v.split("|").length));
      for (let i = 1; i < cols; i++)
        line(
          origin.x + (i * width) / cols,
          origin.y - height,
          origin.x + (i * width) / cols,
          origin.y,
          { opacity: 0.5 },
        );
      for (let i = 1; i < lines.length; i++)
        line(
          origin.x,
          origin.y - height + 8 + i * 18,
          origin.x + width,
          origin.y - height + 8 + i * 18,
          { opacity: 0.5 },
        );
    }
    if (d.type === "pin" || d.type === "sign") {
      add("circle", {
        ...stroke,
        cx: origin.x,
        cy: origin.y + 4,
        r: 4,
        fill: d.color,
      });
      line(origin.x, origin.y, origin.x, origin.y + 17);
    }
    if (d.type === "flag") {
      line(origin.x, origin.y, origin.x, origin.y + 35);
    }
  }
}
