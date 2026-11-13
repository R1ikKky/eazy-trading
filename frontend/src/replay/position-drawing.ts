import type { DrawingPoint } from "./drawing-schema";

export type PositionHandle = "entry" | "stop" | "target" | "width";
export const isPositionDrawing = (type: string) =>
  type === "long-position" || type === "short-position";

/** Older drawings may have their entry anchor at the right edge. */
export function positionAnchors(d: any): DrawingPoint[] {
  const points: DrawingPoint[] = d.points || [d.a, d.b];
  const left = Math.min(...points.map((p) => p.time));
  const right = Math.max(...points.map((p) => p.time));
  return [
    { time: left, price: points[0].price },
    { time: right, price: points[1].price },
    { time: right, price: points[2].price },
  ];
}

export function positionHandles(d: any) {
  const [entry, stop, target] = positionAnchors(d);
  return [
    { kind: "entry" as const, point: entry },
    { kind: "stop" as const, point: { time: entry.time, price: stop.price } },
    {
      kind: "target" as const,
      point: { time: entry.time, price: target.price },
    },
    { kind: "width" as const, point: { time: stop.time, price: entry.price } },
  ];
}

/** Handle drags change only their own axes; body drags translate the whole box. */
export function movePositionHandle(
  d: any,
  handle: PositionHandle | null,
  timeDelta: number,
  priceDelta: number,
  barSeconds = 60,
): DrawingPoint[] {
  const [entry, stop, target] = positionAnchors(d);
  const tick = 0.25;
  const dp = Math.round(priceDelta / tick) * tick;
  if (handle === "stop" || handle === "target") {
    const level = handle === "stop" ? stop : target;
    const above = (d.type === "long-position") === (handle === "target");
    level.price = above
      ? Math.max(entry.price + tick, level.price + dp)
      : Math.max(tick, Math.min(entry.price - tick, level.price + dp));
  } else if (handle === "entry") {
    entry.price = Math.max(
      Math.min(stop.price, target.price) + tick,
      Math.min(Math.max(stop.price, target.price) - tick, entry.price + dp),
    );
    entry.time = Math.max(
      60,
      Math.min(stop.time - barSeconds, entry.time + timeDelta),
    );
  } else if (handle === "width") {
    stop.time = target.time = Math.max(
      entry.time + barSeconds,
      stop.time + timeDelta,
    );
  } else {
    const dt = Math.max(60 - entry.time, timeDelta);
    const shift = Math.max(
      tick - Math.min(entry.price, stop.price, target.price),
      dp,
    );
    for (const point of [entry, stop, target]) {
      point.time += dt;
      point.price += shift;
    }
  }
  return [entry, stop, target];
}
