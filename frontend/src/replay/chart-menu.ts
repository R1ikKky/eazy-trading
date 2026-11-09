import { t as translate, locale } from "../i18n/language";
import { drawingTool } from "./drawing-catalog";
import { chartDate } from "./settings-model";

export function createChartMenu({
  chart,
  series,
  container,
  prefs,
  getBars,
  getNow,
  getDrawings,
  changeDrawing,
  removeDrawings,
  selectDrawing,
  pasteDrawing,
  createLevel,
  getLock,
  setLock,
  applySettings,
  openSettings,
  resetView,
  pause,
  toast,
}: any) {
  const menu = document.createElement("div");
  menu.id = "chartContextMenu";
  menu.className = "tv-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Chart menu");
  menu.hidden = true;
  document.body.append(menu);
  const table = document.createElement("dialog");
  table.id = "chartTableDialog";
  table.className = "tv-data-dialog";
  table.setAttribute("aria-label", "Table view");
  document.body.append(table);
  const tree = document.createElement("dialog");
  tree.id = "chartObjectDialog";
  tree.className = "tv-data-dialog tv-object-dialog";
  tree.setAttribute("aria-label", "Object tree");
  document.body.append(tree);
  let clickedPrice: any = null,
    clickedTime: any = null,
    page = 0;
  const item = (action: any, label: any, extra = "") =>
    '<button type="button" role="menuitem" data-menu="' +
    action +
    '"><span>' +
    label +
    "</span>" +
    extra +
    "</button>";
  const divider = '<div class="tv-menu-divider" role="separator"></div>';
  function visibleDrawings() {
    return getDrawings().filter((d) => d.createdAt <= getNow());
  }
  function close() {
    menu.hidden = true;
    container.focus({ preventScroll: true });
  }
  function renderMenu() {
    menu.innerHTML =
      item("reset", "↶ &nbsp; Reset chart view", "<small>Alt + R</small>") +
      divider +
      item(
        "copy",
        "Copy price " +
          (clickedPrice === null
            ? "—"
            : clickedPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })),
      ) +
      item("paste", "Paste", "<small>Ctrl + V</small>") +
      divider +
      item("move", "Move chart", "<span>›</span>") +
      '<div id="chartMoveMenu" class="tv-move-menu" role="menu" hidden>' +
      item("latest", "Go to latest candle") +
      item("first", "Go to first candle") +
      item("left", "Move left") +
      item("right", "Move right") +
      "</div>" +
      divider +
      item(
        "lock",
        getLock()
          ? "Unlock vertical cursor line"
          : "Lock vertical cursor line by time",
      ) +
      divider +
      item("table", "Table view") +
      item("tree", "Object tree") +
      divider +
      item("remove", "Remove " + visibleDrawings().length + " drawings") +
      divider +
      item(
        "marks",
        prefs.hideMarks ? "Show marks on bars" : "Hide marks on bars",
      ) +
      divider +
      item("settings", "⚙ &nbsp; Settings…");
    (
      menu.querySelector<HTMLElement>("[data-menu=copy]") as HTMLButtonElement
    ).disabled = clickedPrice === null;
    (
      menu.querySelector<HTMLElement>("[data-menu=remove]") as HTMLButtonElement
    ).disabled = !visibleDrawings().length;
    for (const button of menu.querySelectorAll<HTMLElement>("[data-menu]"))
      button.onclick = () => action(button.dataset.menu);
  }
  function show(e: any) {
    e.preventDefault();
    pause();
    const rect = container.getBoundingClientRect(),
      bars = getBars(),
      left = chart.priceScale("left").width?.() || 0;
    clickedPrice = series.coordinateToPrice(e.clientY - rect.top);
    if (clickedPrice !== null) clickedPrice = Math.round(clickedPrice * 4) / 4;
    const logical = chart
      .timeScale()
      .coordinateToLogical(e.clientX - rect.left - left);
    clickedTime =
      logical === null || !bars.length
        ? null
        : bars[Math.max(0, Math.min(bars.length - 1, Math.round(logical)))]
            .time;
    renderMenu();
    menu.hidden = false;
    menu.style.left =
      Math.max(8, Math.min(window.innerWidth - 300, e.clientX)) + "px";
    menu.style.top =
      Math.max(
        8,
        Math.min(window.innerHeight - menu.offsetHeight - 8, e.clientY),
      ) + "px";
    menu.querySelector<HTMLElement>("[data-menu=reset]").focus();
  }
  container.tabIndex = 0;
  container.setAttribute(
    "aria-label",
    "Replay chart. Right click for chart menu.",
  );
  container.addEventListener("contextmenu", show);
  async function paste() {
    try {
      if (!navigator.clipboard?.readText)
        throw Error(translate("Браузер не предоставляет доступ к буферу обмена."));
      const text = (await navigator.clipboard.readText()).trim();
      if (text.startsWith("{")) {
        const data = JSON.parse(text);
        if (data.replayLabDrawing !== 1)
          throw Error(translate("В буфере нет разметки Replay Lab."));
        pasteDrawing(data.drawing, data.symbol);
      } else {
        const value = Number(text.replace(/,/g, ""));
        if (!text || !Number.isFinite(value) || value <= 0)
          throw Error(translate("Скопируйте цену либо объект из Object tree."));
        createLevel(Math.round(value * 4) / 4);
      }
      toast(translate("Объект вставлен."));
    } catch (e) {
      toast(
        e.name === "NotAllowedError"
          ? translate("Разрешите доступ к буферу обмена в браузере.")
          : e.message,
      );
    }
  }
  async function action(name: any) {
    if (name === "move") {
      const sub = document.getElementById("chartMoveMenu");
      sub.hidden = !sub.hidden;
      const trigger = menu.querySelector<HTMLElement>("[data-menu=move]");
      trigger.setAttribute("aria-expanded", String(!sub.hidden));
      sub.style.top = trigger.offsetTop + "px";
      sub.style.left =
        menu.getBoundingClientRect().right + 235 > window.innerWidth
          ? "-230px"
          : "100%";
      if (!sub.hidden) sub.querySelector<HTMLButtonElement>("button").focus();
      return;
    }
    close();
    if (name === "reset") resetView();
    if (name === "copy")
      try {
        if (!navigator.clipboard?.writeText)
          throw Error(translate("Буфер обмена недоступен."));
        await navigator.clipboard.writeText(clickedPrice.toFixed(2));
        toast(translate("Цена скопирована."));
      } catch (e) {
        toast(translate("Не удалось скопировать цену: ") + e.message);
      }
    if (name === "paste") await paste();
    if (["latest", "first", "left", "right"].includes(name)) {
      const n = getBars().length;
      if (!n) return;
      const range = chart.timeScale().getVisibleLogicalRange?.() || {
          from: Math.max(0, n - 90),
          to: n + 10,
        },
        width = range.to - range.from;
      let start =
        name === "latest"
          ? Math.max(0, n - width)
          : name === "first"
            ? 0
            : range.from + (name === "left" ? -1 : 1) * width * 0.65;
      start = Math.max(-10, Math.min(n - 1, start));
      chart
        .timeScale()
        .setVisibleLogicalRange({ from: start, to: start + width });
    }
    if (name === "lock") {
      setLock(getLock() ? null : clickedTime);
      toast(
        getLock()
          ? translate("Вертикальная линия закреплена по времени.")
          : translate("Вертикальная линия разблокирована."),
      );
    }
    if (name === "table") {
      page = Math.max(0, Math.ceil(getBars().length / 100) - 1);
      renderTable();
      table.showModal();
    }
    if (name === "tree") {
      renderTree();
      tree.showModal();
    }
    if (name === "remove") {
      if (
        confirm(translate("Удалить ") + visibleDrawings().length + translate(" объектов разметки?"))
      )
        removeDrawings();
    }
    if (name === "marks") applySettings({ hideMarks: !prefs.hideMarks });
    if (name === "settings") openSettings();
  }
  function renderTable() {
    const bars = getBars(),
      pages = Math.max(1, Math.ceil(bars.length / 100));
    page = Math.max(0, Math.min(pages - 1, page));
    const rows = bars.slice(page * 100, page * 100 + 100);
    table.innerHTML =
      translate('<div class="tv-data-header"><h2>Table view</h2><button type="button" data-table-close aria-label="Close table">×</button></div><p class="tv-note">Только раскрытые свечи · ') +
      bars.length.toLocaleString(locale()) +
      " bars · " +
      prefs.timezone +
      '</p><div class="tv-table-scroll"><table><thead><tr><th>Time</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th></tr></thead><tbody></tbody></table></div><div class="tv-data-footer"><button type="button" data-table-prev ' +
      (page === 0 ? "disabled" : "") +
      ">Previous</button><span>" +
      (page + 1) +
      " / " +
      pages +
      '</span><button type="button" data-table-next ' +
      (page === pages - 1 ? "disabled" : "") +
      ">Next</button></div>";
    const tbody = table.querySelector<HTMLElement>("tbody");
    for (const b of rows) {
      const tr = document.createElement("tr");
      for (const value of [
        chartDate(b.time, prefs),
        b.open,
        b.high,
        b.low,
        b.close,
        b.volume ?? 0,
      ]) {
        const td = document.createElement("td");
        td.textContent =
          typeof value === "number"
            ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
            : value;
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.querySelector<HTMLElement>("[data-table-close]").onclick = () =>
      table.close();
    table.querySelector<HTMLElement>("[data-table-prev]").onclick = () => {
      page--;
      renderTable();
    };
    table.querySelector<HTMLElement>("[data-table-next]").onclick = () => {
      page++;
      renderTable();
    };
  }
  function renderTree() {
    tree.innerHTML =
      '<div class="tv-data-header"><h2>Object tree</h2><button type="button" data-tree-close aria-label="Close object tree">×</button></div><div class="tv-tree-list"></div>';
    tree.querySelector<HTMLElement>("[data-tree-close]").onclick = () =>
      tree.close();
    const list = tree.querySelector<HTMLElement>(".tv-tree-list");
    for (const [key, label] of [
      ["sma", "SMA " + prefs.smaPeriod],
      ["ema", "EMA " + prefs.emaPeriod],
      ["volume", "Volume"],
    ]) {
      const row = document.createElement("div");
      row.className = "tv-tree-row";
      row.innerHTML = '<span></span><button type="button"></button>';
      row.firstElementChild.textContent = label;
      row.lastElementChild.textContent = prefs[key] ? "Hide" : "Show";
      (row.lastElementChild as HTMLElement).onclick = () => {
        applySettings({ [key]: !prefs[key] });
        renderTree();
      };
      list.append(row);
    }
    const names = {
      level: "Horizontal level",
      ray: "Horizontal ray",
      trend: "Trend line",
      zone: "Rectangle zone",
    };
    for (const d of visibleDrawings().slice().reverse()) {
      const row = document.createElement("div");
      row.className = "tv-tree-row";
      const title = document.createElement("button");
      title.className = "tv-tree-title";
      title.textContent =
        (drawingTool(d.type)?.name || names[d.type] || d.type) +
        " · " +
        d.a.price.toFixed(2);
      title.onclick = () => {
        selectDrawing(d.id);
        tree.close();
      };
      row.append(title);
      for (const [label, fn] of [
        [
          d.hidden ? "Show" : "Hide",
          () => changeDrawing(d.id, { hidden: !d.hidden }),
        ],
        [
          "Copy",
          async () => {
            try {
              await navigator.clipboard.writeText(
                JSON.stringify({
                  replayLabDrawing: 1,
                  symbol: (
                    document.getElementById("symbol") as HTMLInputElement
                  ).value,
                  drawing: d,
                }),
              );
              toast(translate("Объект скопирован."));
            } catch {
              toast(translate("Не удалось скопировать объект."));
            }
          },
        ],
        ["Delete", () => changeDrawing(d.id, { remove: true })],
      ] as [string, () => unknown][]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(label);
        button.onclick = async () => {
          await fn();
          renderTree();
        };
        row.append(button);
      }
      list.append(row);
    }
    if (!visibleDrawings().length) {
      const note = document.createElement("p");
      note.className = "tv-note";
      note.textContent =
        translate("Разметка появится после создания уровней, линий или зон.");
      list.append(note);
    }
  }
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) menu.hidden = true;
  });
  window.addEventListener("resize", () => (menu.hidden = true));
  window.addEventListener("scroll", () => (menu.hidden = true), {
    passive: true,
  });
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      menu.hidden = true;
      return;
    }
    if (
      e.key === "ArrowRight" &&
      (document.activeElement as HTMLElement as HTMLElement).dataset.menu ===
        "move"
    ) {
      e.preventDefault();
      action("move");
      return;
    }
    if (e.key === "ArrowLeft") {
      document.getElementById("chartMoveMenu").hidden = true;
      menu.querySelector<HTMLElement>("[data-menu=move]").focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [
      ...menu.querySelectorAll<HTMLElement>("[data-menu]"),
    ].filter(
      (b) => !(b as HTMLButtonElement).disabled && !b.closest("[hidden]"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[
      (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length
    ]?.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (
      document.querySelector<HTMLDialogElement>("dialog[open]") ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    if (e.altKey && e.code === "KeyR") {
      e.preventDefault();
      resetView();
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.code === "KeyV" &&
      (!menu.hidden ||
        container.contains(document.activeElement as HTMLElement))
    ) {
      e.preventDefault();
      close();
      paste();
    }
  });
  return {
    close: () => (menu.hidden = true),
    refresh() {
      if (table.open) renderTable();
      if (tree.open) renderTree();
    },
  };
}
