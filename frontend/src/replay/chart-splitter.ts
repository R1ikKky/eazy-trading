import { t as translate } from "../i18n/language";

type Shares = { sideBySide: number; stacked: number };
/** Resize the containers; Lightweight Charts observes their new sizes itself. */
export function installChartSplitter() {
  const panes = document.getElementById("chartPanes");
  const first = panes?.querySelector<HTMLElement>(".primary-pane");
  const second = panes?.querySelector<HTMLElement>(".comparison-card");
  if (!panes || !first || !second || panes.querySelector(".chart-splitter"))
    return;
  const key = "eazy-trading-chart-split";
  const shares: Shares = { sideBySide: 0.5, stacked: 0.5 };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    for (const mode of ["sideBySide", "stacked"] as const)
      if (Number.isFinite(saved?.[mode]) && saved[mode] > 0 && saved[mode] < 1)
        shares[mode] = saved[mode];
  } catch {}
  const narrow = matchMedia("(max-width: 700px)");
  const divider = document.createElement("div");
  divider.className = "chart-splitter";
  divider.tabIndex = 0;
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", translate("Изменить размеры графиков"));
  divider.title = translate(
    "Перетащите для изменения размеров · двойной клик — поровну",
  );
  first.id = "primaryChartPane";
  second.id = "comparisonChartPane";
  divider.setAttribute("aria-controls", first.id + " " + second.id);
  divider.innerHTML = '<span aria-hidden="true"></span>';
  panes.insertBefore(divider, second);
  let drag: {
    pointerId: number;
    mode: keyof Shares;
    offset: number;
    initial: number;
  } | null = null;
  const mode = (): keyof Shares => (narrow.matches ? "stacked" : "sideBySide");
  function bounds() {
    const rect = panes!.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    const available = narrow.matches
      ? rect.height - dividerRect.height
      : rect.width - dividerRect.width;
    const minimum =
      available > 0
        ? Math.min(0.4, (narrow.matches ? 140 : 220) / available)
        : 0.2;
    return { rect, available, minimum };
  }
  function apply(value = shares[mode()]) {
    const { available, minimum } = bounds();
    if (available <= 0) return;
    const share = Math.max(minimum, Math.min(1 - minimum, value));
    shares[mode()] = share;
    panes!.style.setProperty("--primary-chart-fr", String(share) + "fr");
    panes!.style.setProperty("--secondary-chart-fr", String(1 - share) + "fr");
    divider.setAttribute(
      "aria-orientation",
      narrow.matches ? "horizontal" : "vertical",
    );
    divider.setAttribute("aria-valuemin", String(Math.round(minimum * 100)));
    divider.setAttribute(
      "aria-valuemax",
      String(Math.round((1 - minimum) * 100)),
    );
    divider.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    divider.setAttribute(
      "aria-valuetext",
      Math.round(share * 100) + "% / " + Math.round((1 - share) * 100) + "%",
    );
  }
  function persist() {
    try {
      localStorage.setItem(key, JSON.stringify(shares));
    } catch {}
  }
  function end(cancel = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    delete document.body.dataset.chartResize;
    divider.classList.remove("is-dragging");
    if (cancel) {
      shares[previous.mode] = previous.initial;
      apply();
    }
    if (divider.hasPointerCapture(previous.pointerId))
      divider.releasePointerCapture(previous.pointerId);
    persist();
  }
  divider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !panes.classList.contains("is-dual")) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = divider.getBoundingClientRect(),
      axis = narrow.matches ? "y" : "x";
    drag = {
      pointerId: event.pointerId,
      mode: mode(),
      initial: shares[mode()],
      offset:
        axis === "x" ? event.clientX - rect.left : event.clientY - rect.top,
    };
    document.body.dataset.chartResize = axis;
    divider.classList.add("is-dragging");
    divider.focus({ preventScroll: true });
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const { rect, available } = bounds();
    if (available > 0)
      apply(
        ((narrow.matches
          ? event.clientY - rect.top
          : event.clientX - rect.left) -
          drag.offset) /
          available,
      );
  });
  divider.addEventListener("pointerup", () => end());
  divider.addEventListener("pointercancel", () => end());
  divider.addEventListener("lostpointercapture", () => end());
  divider.addEventListener("dblclick", (event) => {
    event.preventDefault();
    end();
    apply(0.5);
    persist();
  });
  divider.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      event.preventDefault();
      event.stopPropagation();
      end(true);
      return;
    }
    const decrease = narrow.matches ? "ArrowUp" : "ArrowLeft",
      increase = narrow.matches ? "ArrowDown" : "ArrowRight";
    if (![decrease, increase, "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { minimum } = bounds();
    apply(
      event.key === "Home"
        ? minimum
        : event.key === "End"
          ? 1 - minimum
          : shares[mode()] +
            (event.key === decrease ? -1 : 1) * (event.shiftKey ? 0.1 : 0.02),
    );
    persist();
  });
  narrow.addEventListener("change", () => {
    end();
    apply();
  });
  window.addEventListener("resize", () => {
    end();
    apply();
  });
  window.addEventListener("workspace-route", () => end());
  new ResizeObserver(() => apply()).observe(panes);
  apply();
}
