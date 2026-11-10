import { t, locale } from "../i18n/language";
import {
  SESSION_OPENINGS,
  nextSessionOpening,
  type SessionOpening,
} from "./session-openings";
import type { Replay } from "./engine";

export function installSessionJump({
  getReplay,
  jump,
  pause,
}: {
  getReplay: () => Replay | undefined;
  jump: (session: SessionOpening) => void;
  pause: () => void;
}) {
  const trigger = document.getElementById("sessionSkip")!;
  const menu = document.createElement("div");
  menu.className = "session-jump-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", t("Перейти к открытию сессии"));
  document.body.append(menu);
  const date = new Intl.DateTimeFormat(locale(), {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  trigger.addEventListener("click", () => {
    if (menu.matches(":popover-open")) {
      menu.hidePopover();
      return;
    }
    pause();
    const replay = getReplay();
    menu.replaceChildren();
    for (const session of SESSION_OPENINGS) {
      const target = replay
        ? nextSessionOpening(replay.bars, replay.index, session)
        : -1;
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.dataset.sessionOpening = session.id;
      item.disabled = target < 0;
      const name = document.createElement("strong");
      name.textContent = t(session.name);
      const clock = document.createElement("span");
      clock.textContent = session.clock;
      const next = document.createElement("small");
      next.textContent =
        target < 0
          ? t("Нет открытия в оставшихся данных")
          : date.format(new Date(replay!.bars[target].time * 1000)) + " ET";
      item.append(name, clock, next);
      item.onclick = () => {
        menu.hidePopover();
        jump(session);
        trigger.focus({ preventScroll: true });
      };
      menu.append(item);
    }
    const rect = trigger.getBoundingClientRect();
    const height = 245;
    Object.assign(menu.style, {
      left: Math.max(10, Math.min(rect.left, innerWidth - 290)) + "px",
      top:
        Math.max(
          10,
          Math.min(rect.top - height - 8, innerHeight - height - 10),
        ) + "px",
      maxHeight: innerHeight - 20 + "px",
    });
    menu.showPopover();
  });
  menu.addEventListener("toggle", () =>
    trigger.setAttribute(
      "aria-expanded",
      String(menu.matches(":popover-open")),
    ),
  );
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (!menu.matches(":popover-open")) trigger.click();
    menu.querySelector<HTMLButtonElement>("button:enabled")?.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.hidePopover();
      trigger.focus();
      return;
    }
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>("button:enabled"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[
      (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length
    ]?.focus();
  });
  const close = () => {
    if (menu.matches(":popover-open")) menu.hidePopover();
  };
  window.addEventListener("resize", close);
  window.addEventListener("workspace-route", close);
}
