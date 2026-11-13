type Level = "sl" | "tp";
type Position = { id: string; sl: number; tp: number; side: number };

export function protectionPrice(
  raw: number,
  kind: Level,
  side: number,
  current: number,
) {
  const tick = 0.25;
  const rounded = Math.max(tick, Math.round(raw / tick) * tick);
  const above = (kind === "tp") === (side === 1);
  return above
    ? Math.max(rounded, (Math.floor(current / tick) + 1) * tick)
    : Math.min(rounded, (Math.ceil(current / tick) - 1) * tick);
}

export function installProtectionDrag({
  container,
  chart,
  series,
  getPosition,
  getCurrentPrice,
  canDrag,
  onStart,
  onPreview,
  onCommit,
  onCancel,
}: {
  container: HTMLElement;
  chart: any;
  series: any;
  getPosition: () => Position | null;
  getCurrentPrice: () => number;
  canDrag: () => boolean;
  onStart: () => void;
  onPreview: (kind: Level, price: number) => void;
  onCommit: (kind: Level, price: number) => void;
  onCancel: () => void;
}) {
  let drag: {
    id: string;
    kind: Level;
    pointerId: number;
    price: number;
  } | null = null;
  const hover = (active: boolean) =>
    container.classList.toggle("protection-drag-hover", active);
  const hit = (event: PointerEvent): Level | null => {
    if (
      !canDrag() ||
      (event.target as Element).closest(".drawing-ui, button, input, select, a")
    )
      return null;
    const position = getPosition();
    if (!position) return null;
    const bounds = container.getBoundingClientRect(),
      y = event.clientY - bounds.top;
    if (y < 0 || y > chart.paneSize().height) return null;
    let nearest: Level | null = null,
      distance = 7;
    for (const kind of ["sl", "tp"] as const) {
      const lineY = series.priceToCoordinate(position[kind]);
      if (lineY != null && Math.abs(y - lineY) <= distance) {
        nearest = kind;
        distance = Math.abs(y - lineY);
      }
    }
    return nearest;
  };
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const finish = (commit: boolean) => {
    const active = drag;
    if (!active) return;
    drag = null;
    hover(false);
    if (container.hasPointerCapture(active.pointerId))
      container.releasePointerCapture(active.pointerId);
    if (commit && getPosition()?.id === active.id)
      onCommit(active.kind, active.price);
    else onCancel();
  };
  container.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || drag) return;
      const kind = hit(event),
        position = getPosition();
      if (!kind || !position) return;
      stop(event);
      onStart();
      drag = {
        id: position.id,
        kind,
        pointerId: event.pointerId,
        price: position[kind],
      };
      container.setPointerCapture(event.pointerId);
      hover(true);
    },
    true,
  );
  container.addEventListener(
    "pointermove",
    (event) => {
      if (!drag) {
        hover(hit(event) !== null);
        return;
      }
      if (event.pointerId !== drag.pointerId) return;
      stop(event);
      const position = getPosition();
      if (!position || position.id !== drag.id || !canDrag()) {
        finish(false);
        return;
      }
      const bounds = container.getBoundingClientRect();
      const y = Math.max(
        0,
        Math.min(chart.paneSize().height, event.clientY - bounds.top),
      );
      const raw = series.coordinateToPrice(y);
      if (raw == null || !Number.isFinite(raw)) return;
      drag.price = protectionPrice(
        raw,
        drag.kind,
        position.side,
        getCurrentPrice(),
      );
      onPreview(drag.kind, drag.price);
    },
    true,
  );
  container.addEventListener(
    "pointerup",
    (event) => {
      if (drag?.pointerId !== event.pointerId) return;
      stop(event);
      finish(true);
    },
    true,
  );
  container.addEventListener("pointercancel", () => finish(false), true);
  container.addEventListener("lostpointercapture", () => finish(false));
  container.addEventListener("pointerleave", () => {
    if (!drag) hover(false);
  });
  window.addEventListener("blur", () => finish(false));
  window.addEventListener(
    "keydown",
    (event) => {
      if (drag && event.key === "Escape") {
        stop(event);
        finish(false);
      }
    },
    true,
  );
}
