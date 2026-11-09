import {
  DRAWING_GROUPS,
  DRAWING_TOOLS,
  drawingTool,
  drawingIcon,
} from "./drawing-catalog";
export function createDrawingToolbar(callbacks: {
  selectTool: (id: string) => void;
  style: (style: any) => void;
  toast: (text: string) => void;
}) {
  let owner = "local";
  try {
    owner = sessionStorage.getItem("replay-user-id") || "local";
  } catch {}
  const key = "replay-lab-drawing-ui:" + owner;
  let saved: any = {};
  try {
    saved = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  let favorites: string[] = Array.isArray(saved.favorites)
    ? saved.favorites
        .filter((id: any) => typeof id === "string" && drawingTool(id))
        .slice(0, DRAWING_TOOLS.length)
    : [];
  let active = "cursor",
    currentGroup = "cursor",
    position = saved.position;
  const root = document.createElement("div");
  root.className = "drawing-ui";
  root.innerHTML = `<aside class="drawing-rail" aria-label="Инструменты рисования">${DRAWING_GROUPS.map((group) => `<button type="button" class="drawing-group-button" data-group="${group.id}" aria-label="${group.name}" title="${group.name}" aria-haspopup="dialog" aria-expanded="false">${drawingIcon(group.icon)}</button>`).join("")}<div class="drawing-rail-divider"></div><button type="button" data-drawing-toggle="magnet" title="Привязка к OHLC" aria-label="Привязка к свечам" aria-pressed="false">${drawingIcon("magnet")}</button><button type="button" data-drawing-toggle="repeat" title="Оставаться в режиме рисования" aria-label="Повторять инструмент" aria-pressed="false">${drawingIcon("brush")}</button><button type="button" data-drawing-toggle="locked" title="Зафиксировать разметку" aria-label="Зафиксировать разметку" aria-pressed="false">${drawingIcon("lock")}</button><button type="button" data-drawing-toggle="hidden" title="Скрыть разметку" aria-label="Скрыть разметку" aria-pressed="false">${drawingIcon("eye")}</button><div class="drawing-rail-divider"></div><button type="button" data-drawing-style aria-label="Стиль рисования" title="Стиль рисования"><span class="drawing-color-dot"></span></button><button id="drawUndo" type="button" title="Отменить рисование" aria-label="Отменить последнее рисование">↶</button><button id="drawDelete" type="button" title="Удалить выбранный объект" aria-label="Удалить выбранный объект">⌫</button><button id="drawClear" type="button" title="Удалить всю разметку" aria-label="Удалить всю разметку">${drawingIcon("trash")}</button><button type="button" data-favorites-toggle title="Избранные инструменты" aria-label="Избранные инструменты">${drawingIcon("star")}</button></aside><section class="drawing-group-menu" popover="auto" role="dialog" aria-label="Выбор инструмента"><header><strong></strong><button type="button" data-menu-close aria-label="Закрыть инструменты">×</button></header><label class="drawing-search-label"><span class="sr-only">Найти инструмент</span><input type="search" class="drawing-tool-search" placeholder="Найти инструмент" autocomplete="off"></label><div class="drawing-tool-list"></div><p class="drawing-menu-help"></p></section><div class="drawing-favorites" role="toolbar" aria-label="Избранные инструменты рисования"><button type="button" class="drawing-favorites-grip" aria-label="Переместить избранное" title="Перетащите панель">⠿</button><div class="drawing-favorites-items"></div><button type="button" data-favorites-close aria-label="Скрыть избранное">×</button></div><section class="drawing-style-menu" popover="auto" role="dialog" aria-label="Стиль рисования"><h3>Стиль разметки</h3><label>Цвет<input type="color" id="drawingStyleColor" value="#99bff1"></label><label>Толщина<select id="drawingStyleWidth"><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="4">4 px</option></select></label><label>Заливка<input type="range" id="drawingStyleOpacity" min="0" max="100" value="15"></label><label class="drawing-style-check"><input type="checkbox" id="drawingStyleDashed">Пунктир</label></section>`;
  document.body.append(root);
  const rail = root.querySelector<HTMLElement>(".drawing-rail")!,
    menu = root.querySelector<HTMLElement>(".drawing-group-menu")!,
    list = root.querySelector<HTMLElement>(".drawing-tool-list")!,
    search = root.querySelector<HTMLInputElement>(".drawing-tool-search")!,
    dock = root.querySelector<HTMLElement>(".drawing-favorites")!,
    styleMenu = root.querySelector<HTMLElement>(".drawing-style-menu")!;
  const state = {
    magnet: !!saved.magnet,
    repeat: !!saved.repeat,
    locked: !!saved.locked,
    hidden: !!saved.hidden,
  };
  let showFavorites = saved.showFavorites !== false;
  const persist = () => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ ...state, favorites, position, showFavorites }),
      );
    } catch {}
  };
  function placeMenu(element: HTMLElement, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const top = Math.max(10, Math.min(rect.top, innerHeight - 650));
    Object.assign(element.style, {
      left: Math.min(innerWidth - 180, rect.right + 9) + "px",
      top: top + "px",
      width: Math.min(350, innerWidth - rect.right - 20) + "px",
      maxHeight: innerHeight - top - 12 + "px",
    });
  }
  function renderList() {
    const group = DRAWING_GROUPS.find((group) => group.id === currentGroup)!;
    const query = search.value.trim().toLocaleLowerCase();
    const tools = query
      ? DRAWING_TOOLS.filter((tool) =>
          tool.name.toLocaleLowerCase().includes(query),
        )
      : group.tools;
    menu.querySelector("strong")!.textContent = query
      ? "Результаты поиска"
      : group.name;
    list.replaceChildren();
    for (const tool of tools) {
      const row = document.createElement("div");
      row.className = "drawing-tool-row";
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tool = tool.id;
      button.setAttribute("aria-pressed", String(active === tool.id));
      button.innerHTML = drawingIcon(tool.id);
      const name = document.createElement("span");
      name.textContent = tool.name;
      button.append(name);
      const star = document.createElement("button");
      star.type = "button";
      star.dataset.favorite = tool.id;
      star.className = "drawing-favorite-star";
      star.setAttribute("aria-pressed", String(favorites.includes(tool.id)));
      star.setAttribute(
        "aria-label",
        `${favorites.includes(tool.id) ? "Убрать из избранного" : "Добавить в избранное"}: ${tool.name}`,
      );
      star.title = "Добавить / убрать из избранного";
      star.textContent = favorites.includes(tool.id) ? "★" : "☆";
      row.append(button, star);
      list.append(row);
    }
    menu.querySelector(".drawing-menu-help")!.textContent =
      currentGroup === "analysis"
        ? "Позиции и прогнозы — разметка. Профили OHLCV оценивают объём по типичной цене свечи."
        : currentGroup === "patterns"
          ? "Расставьте точки вручную. Это разметка, а не автоматический поиск паттернов."
          : "Нажмите ☆, чтобы добавить инструмент на быструю панель.";
  }
  function clampDock() {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    )
      position = {
        x: Math.max(12, (innerWidth - dock.offsetWidth) / 2),
        y: innerHeight - 76,
      };
    position = {
      x: Math.max(10, Math.min(position.x, innerWidth - dock.offsetWidth - 10)),
      y: Math.max(
        10,
        Math.min(position.y, innerHeight - dock.offsetHeight - 10),
      ),
    };
    dock.style.left = position.x + "px";
    dock.style.top = position.y + "px";
  }
  function renderFavorites() {
    const holder = dock.querySelector(".drawing-favorites-items")!;
    holder.replaceChildren();
    for (const id of favorites) {
      const tool = drawingTool(id)!;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tool = id;
      button.title = tool.name;
      button.setAttribute("aria-label", tool.name);
      button.setAttribute("aria-pressed", String(active === id));
      button.innerHTML = drawingIcon(id);
      holder.append(button);
    }
    dock.hidden = !favorites.length || !showFavorites;
    clampDock();
    persist();
  }
  const choose = (id: string) => {
    callbacks.selectTool(id);
    if (menu.matches(":popover-open")) menu.hidePopover();
  };
  root.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "button",
    );
    if (!button) return;
    if (button.dataset.tool) {
      choose(button.dataset.tool);
      return;
    }
    if (button.dataset.favorite) {
      const id = button.dataset.favorite;
      favorites = favorites.includes(id)
        ? favorites.filter((value) => value !== id)
        : [...favorites, id].slice(-DRAWING_TOOLS.length);
      showFavorites = true;
      renderList();
      renderFavorites();
      return;
    }
    if (button.dataset.group) {
      const wasOpen =
        menu.matches(":popover-open") && currentGroup === button.dataset.group;
      currentGroup = button.dataset.group;
      search.value = "";
      renderList();
      placeMenu(menu, button);
      if (styleMenu.matches(":popover-open")) styleMenu.hidePopover();
      if (wasOpen) menu.hidePopover();
      else menu.showPopover();
      return;
    }
    if (button.hasAttribute("data-menu-close")) {
      menu.hidePopover();
      return;
    }
    if (button.dataset.drawingToggle) {
      const key = button.dataset.drawingToggle as keyof typeof state;
      state[key] = !state[key];
      button.setAttribute("aria-pressed", String(state[key]));
      persist();
      window.dispatchEvent(new Event("drawing-ui-change"));
      return;
    }
    if (button.hasAttribute("data-favorites-toggle")) {
      if (!favorites.length) {
        callbacks.toast("Откройте группу и нажмите ☆ у нужного инструмента.");
        return;
      }
      showFavorites = !showFavorites;
      renderFavorites();
    }
    if (button.hasAttribute("data-favorites-close")) {
      showFavorites = false;
      renderFavorites();
    }
    if (button.hasAttribute("data-drawing-style")) {
      placeMenu(styleMenu, button);
      styleMenu.togglePopover();
    }
  });
  menu.addEventListener("toggle", () => {
    for (const button of rail.querySelectorAll<HTMLElement>("[data-group]"))
      button.setAttribute(
        "aria-expanded",
        String(
          menu.matches(":popover-open") &&
            button.dataset.group === currentGroup,
        ),
      );
  });
  search.oninput = renderList;
  for (const [key, value] of Object.entries(state))
    root
      .querySelector(`[data-drawing-toggle="${key}"]`)!
      .setAttribute("aria-pressed", String(value));
  const color = root.querySelector<HTMLInputElement>("#drawingStyleColor")!,
    width = root.querySelector<HTMLSelectElement>("#drawingStyleWidth")!,
    opacity = root.querySelector<HTMLInputElement>("#drawingStyleOpacity")!,
    dashed = root.querySelector<HTMLInputElement>("#drawingStyleDashed")!;
  for (const input of [color, width, opacity, dashed])
    input.addEventListener("change", () =>
      callbacks.style({
        color: color.value,
        width: Number(width.value),
        opacity: Number(opacity.value),
        dashed: dashed.checked,
      }),
    );
  const grip = dock.querySelector<HTMLElement>(".drawing-favorites-grip")!;
  let drag: any = null;
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = dock.getBoundingClientRect();
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener("pointermove", (event) => {
    if (!drag) return;
    position = {
      x: drag.left + event.clientX - drag.x,
      y: drag.top + event.clientY - drag.y,
    };
    clampDock();
  });
  const end = () => {
    drag = null;
    persist();
  };
  grip.addEventListener("keydown", (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    clampDock();
    const step = event.shiftKey ? 40 : 10;
    if (event.key === "ArrowLeft") position.x -= step;
    if (event.key === "ArrowRight") position.x += step;
    if (event.key === "ArrowUp") position.y -= step;
    if (event.key === "ArrowDown") position.y += step;
    clampDock();
    persist();
  });
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
  window.addEventListener("resize", () => {
    clampDock();
    if (menu.matches(":popover-open")) menu.hidePopover();
    if (styleMenu.matches(":popover-open")) styleMenu.hidePopover();
  });
  document.addEventListener("fullscreenchange", () => {
    (document.fullscreenElement || document.body).append(root);
    clampDock();
  });
  window.addEventListener("workspace-route", () => {
    if (location.pathname !== "/replay") {
      if (menu.matches(":popover-open")) menu.hidePopover();
      if (styleMenu.matches(":popover-open")) styleMenu.hidePopover();
    }
  });
  renderFavorites();
  return {
    state,
    setActive(id: string) {
      active = id;
      root
        .querySelectorAll<HTMLElement>("[data-tool]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.tool === id),
          ),
        );
      root.querySelectorAll<HTMLElement>("[data-group]").forEach((button) =>
        button.classList.toggle(
          "active",
          DRAWING_GROUPS.find((g) => g.id === button.dataset.group)?.tools.some(
            (tool) => tool.id === id,
          ),
        ),
      );
    },
    setStyle(value: any) {
      color.value = value.color;
      width.value = String(value.width);
      opacity.value = String(value.opacity);
      dashed.checked = !!value.dashed;
      rail.style.setProperty("--drawing-color", value.color);
    },
    async text(initial = ""): Promise<string | null> {
      const dialog = document.createElement("dialog");
      dialog.className = "drawing-text-dialog";
      dialog.innerHTML =
        '<form><div class="dialog-header"><h2>Текст разметки</h2><button type="button" aria-label="Отменить текст">×</button></div><label for="drawingTextInput">Текст · для таблицы: строки с разделителем |</label><textarea id="drawingTextInput" rows="5" maxlength="500" required></textarea><button type="submit" class="button primary full">Добавить</button></form>';
      root.append(dialog);
      const textarea = dialog.querySelector("textarea")!;
      textarea.value = initial;
      return new Promise((resolve) => {
        let result: string | null = null;
        dialog.addEventListener(
          "close",
          () => {
            dialog.remove();
            resolve(result);
          },
          { once: true },
        );
        dialog.querySelector("form")!.onsubmit = (event) => {
          event.preventDefault();
          if (!textarea.value.trim()) return;
          result = textarea.value.trim();
          dialog.close();
        };
        dialog.querySelector("button")!.onclick = () => dialog.close();
        let outside = false;
        const isOutside = (event: MouseEvent) => {
          const r = dialog.getBoundingClientRect();
          return (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          );
        };
        dialog.addEventListener("pointerdown", (event) => {
          outside = event.target === dialog && isOutside(event);
        });
        dialog.addEventListener("click", (event) => {
          if (outside && event.target === dialog && isOutside(event))
            dialog.close();
          outside = false;
        });
        dialog.showModal();
        textarea.focus();
      });
    },
  };
}
