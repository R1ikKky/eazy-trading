type EntryState = {
  price: number;
  label: string;
  action: string;
  mode: "cancel" | "close";
  disabled: boolean;
};

export function createEntryControl({
  container,
  chart,
  series,
  getState,
  onAction,
}: {
  container: HTMLElement;
  chart: any;
  series: any;
  getState: () => EntryState | null;
  onAction: () => void;
}) {
  const element = document.createElement("div");
  element.className = "position-entry-control";
  element.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "position-entry-action";
  const caption = document.createElement("span"),
    cross = document.createElement("span");
  cross.textContent = "×";
  cross.setAttribute("aria-hidden", "true");
  button.append(caption, cross);
  const label = document.createElement("span");
  label.className = "position-entry-label";
  element.append(button, label);
  container.append(element);
  let frame = 0;
  const refresh = () => {
    const state = getState();
    const y = state ? series.priceToCoordinate(state.price) : null;
    element.hidden =
      !state || y == null || y < 0 || y > chart.paneSize().height;
    if (element.hidden || !state) return;
    element.style.top = y + "px";
    element.style.right = chart.priceScale("right").width() + "px";
    element.dataset.action = state.mode;
    label.textContent = state.label;
    caption.textContent = state.action;
    button.disabled = state.disabled;
    button.setAttribute("aria-label", state.action);
    button.title = state.action;
  };
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        refresh();
      });
  };
  // Price-axis panning and zooming also redraw primitives, so the DOM control
  // stays attached to the exact price label without polling every frame.
  series.attachPrimitive({
    updateAllViews: schedule,
    detached: () => {
      cancelAnimationFrame(frame);
      element.remove();
    },
  });
  new ResizeObserver(schedule).observe(container);
  for (const name of ["pointerdown", "mousedown", "dblclick"])
    element.addEventListener(name, (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onAction();
  });
  return { refresh };
}
