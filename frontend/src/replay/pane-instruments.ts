import { t as translate } from "../i18n/language";
import { contracts } from "./engine";
export function installPaneInstrumentMenu({
  trigger,
  getSymbol,
  choose,
  activate,
  toast,
}: any) {
  const menu = document.createElement("div");
  menu.className = "pane-instrument-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", translate("Инструмент"));
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  menu.innerHTML = ["NQ", "ES"]
    .map(
      (symbol) =>
        `<button type="button" role="menuitemradio" data-instrument="${symbol}"><strong>${symbol}</strong><span>${contracts[symbol].name}</span><small>CME</small></button>`,
    )
    .join("");
  document.body.append(menu);
  let busy = false;
  trigger.addEventListener("click", () => {
    activate();
    for (const item of menu.querySelectorAll<HTMLElement>("[data-instrument]"))
      item.setAttribute(
        "aria-checked",
        String(item.dataset.instrument === getSymbol()),
      );
    const rect = trigger.getBoundingClientRect();
    Object.assign(menu.style, {
      left: Math.max(10, Math.min(rect.left, innerWidth - 250)) + "px",
      top:
        (innerHeight - rect.bottom > 130
          ? rect.bottom + 8
          : Math.max(10, rect.top - 115)) + "px",
    });
    menu.togglePopover();
  });
  trigger.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (!menu.matches(":popover-open")) trigger.click();
    menu.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      menu.hidePopover();
      trigger.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.querySelectorAll<HTMLButtonElement>("button")],
      index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[
      (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length
    ]?.focus();
  });
  menu.addEventListener("toggle", () =>
    trigger.setAttribute(
      "aria-expanded",
      String(menu.matches(":popover-open")),
    ),
  );
  menu.addEventListener("click", async (event) => {
    const item = (event.target as Element).closest<HTMLButtonElement>(
      "[data-instrument]",
    );
    if (!item || busy) return;
    busy = true;
    for (const button of menu.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = true;
    try {
      await choose(item.dataset.instrument);
      menu.hidePopover();
      trigger.focus({ preventScroll: true });
    } catch (error) {
      toast(error.message);
    } finally {
      busy = false;
      for (const button of menu.querySelectorAll<HTMLButtonElement>("button"))
        button.disabled = false;
    }
  });
  window.addEventListener("resize", () => {
    if (menu.matches(":popover-open")) menu.hidePopover();
  });
  window.addEventListener("workspace-route", () => {
    if (menu.matches(":popover-open")) menu.hidePopover();
  });
}
