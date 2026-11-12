import { t as translate, locale, configureLanguagePersistence } from "../i18n/language";
import { element as $ } from "./dom";
import { dayKey } from "./engine";
import { WORKSPACE_ROUTES, workspaceView } from "./workspace-routes";
import {
  WorkspaceStore,
  uid,
  escapeHTML as esc,
  blankWorkspace,
} from "./workspace-store";
import {
  analyzeTrades,
  renderAnalytics,
  filterTrades,
  csvTrades,
} from "./analytics";
const money = (v: any) =>
  (v < 0 ? "−" : "") +
  "$" +
  Math.abs(Number(v) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const decimal = (v: any) => (Number.isFinite(v) ? v.toFixed(2) : "—");
const attachmentURL = (v: any) =>
  typeof v === "string" && /^\/api\/attachments\/[a-zA-Z0-9_-]+$/.test(v);
const date = (s: any) =>
  s && Number.isFinite(Date.parse(s))
    ? new Date(s).toLocaleDateString(locale(), {
        day: "numeric",
        month: "short",
      })
    : "—";
const time = (t: any) =>
  !Number.isFinite(t) || !Number.isFinite(new Date(t * 1000).getTime())
    ? "—"
    : new Intl.DateTimeFormat(locale(), {
        timeZone: "America/New_York",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(t * 1000));
const safe =
  (fn: any) =>
  async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      document.dispatchEvent(
        new CustomEvent("product-error", { detail: error.message }),
      );
    }
  };
function download(name: any, text: any, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function createProduct({
  toast,
  activate,
  capture,
  getPreferences,
  setPreferences,
  onNavigate,
  openDataset,
}: any) {
  let view = "sessions",
    selectedTrade = null,
    loaded = false,
    navigationReady = false,
    applyingRemote = false,
    pendingRemote: any = null,
    interacting = false,
    filter: Record<string, any> = {};
  const store = new WorkspaceStore((state: any, label: any) => {
    const status = $("saveStatus");
    if (status) {
      status.dataset.state = state;
      status.textContent = translate(label);
      status.title = translate(label);
    }
  });
  configureLanguagePersistence(async () => {
    store.cache();
    while (store.saving) await new Promise(resolve => setTimeout(resolve, 25));
    await store.flush();
    store.cache();
  });
  const ws = () => store.value;
  const active = () =>
    ws().sessions.find((s: any) => s.id === ws().settings.activeSessionId);
  const strategies = () => ws().playbooks || [];
  const allTrades = () =>
    ws().sessions.flatMap((s: any) =>
      (s.snapshot?.trades || []).map((t: any) => {
        const raw = s.annotations?.[t.id] || {},
          annotation = {
            notes: typeof raw.notes === "string" ? raw.notes : "",
            tags: Array.isArray(raw.tags)
              ? raw.tags.filter((x: any) => typeof x === "string")
              : [],
            checklist: raw.checklist,
            attachments: raw.attachments,
          },
          strategyId = raw.strategyId ?? s.strategyId;
        return {
          ...t,
          ...annotation,
          sessionId: s.id,
          sessionName: s.name,
          capital: s.capital,
          strategyId,
          strategyName:
            strategies().find((x: any) => x.id === strategyId)?.name ||
            translate("Без стратегии"),
          source: s.source,
        };
      }),
    );
  document.addEventListener("product-error", (e) =>
    toast((e as CustomEvent<string>).detail),
  );
  function options(selected = "", includeEmpty = true) {
    return (
      (includeEmpty ? translate('<option value="">Без стратегии</option>') : "") +
      strategies()
        .map(
          (p: any) =>
            '<option value="' +
            esc(p.id) +
            '" ' +
            (selected === p.id ? "selected" : "") +
            ">" +
            esc(p.name) +
            "</option>",
        )
        .join("")
    );
  }
  function fillStrategies() {
    if ($("sessionStrategy"))
      $("sessionStrategy").innerHTML = options(active()?.strategyId);
  }
  function changed() {
    store.changed();
    if (view !== "replay") renderView();
  }
  function navigate(next: any, updateUrl = true) {
    if (
      ![
        "replay",
        "sessions",
        "journal",
        "analytics",
        "playbooks",
      ].includes(next)
    )
      return;
    if (navigationReady) onNavigate?.(next);
    const ticket = document.getElementById("orderTicket");
    if (next !== "replay" && ticket?.matches(":popover-open")) ticket.hidePopover();
    view = next;
    for (const el of document.querySelectorAll<HTMLElement>('[id^="view-"]'))
      el.hidden = el.id !== "view-" + next;
    for (const b of document.querySelectorAll<HTMLElement>("[data-view]")) {
      b.classList.toggle("active", b.dataset.view === next);
      b.setAttribute(
        "aria-current",
        b.dataset.view === next ? "page" : "false",
      );
    }
    if (updateUrl && location.pathname !== WORKSPACE_ROUTES[next])
      window.dispatchEvent(new CustomEvent("workspace-navigate", { detail: WORKSPACE_ROUTES[next] }));
    renderView();
    window.dispatchEvent(new Event("resize"));
  }
  function updateHeader() {}
  function createSession({
    symbol,
    from,
    to,
    session,
    datasetId,
    comparisonDatasetId,
    source,
    snapshot,
    name,
    capital,
    strategyId,
  }: any) {
    const now = new Date().toISOString();
    const s = {
      id: uid(),
      name: (name || symbol + " · " + from).slice(0, 100),
      symbol,
      from,
      to,
      session,
      datasetId,
      ...(comparisonDatasetId ? { comparisonDatasetId } : {}),
      source,
      capital: Number(capital) || 50000,
      strategyId: strategyId || "",
      createdAt: now,
      updatedAt: now,
      snapshot,
      notes: "",
      annotations: {},
      drawings: [],
    };
    if (ws().sessions.length >= 1000)
      throw Error(translate("Достигнут предел: 1000 сессий. Экспортируйте архив."));
    ws().sessions.push(s);
    ws().settings.activeSessionId = s.id;
    changed();
    fillStrategies();
    updateHeader();
    return s;
  }
  function saveReplay(snapshot: any) {
    if (!loaded || applyingRemote || !active()) return;
    const s = active();
    s.snapshot = snapshot;
    s.updatedAt = new Date().toISOString();
    store.changed();
    updateHeader();
    if (view === "journal" || view === "analytics" || view === "sessions")
      renderView();
  }
  function renderSessions() {
    const box = $("sessionsContent");
    if (!box) return;
    const sessions = [...ws().sessions].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    box.innerHTML =
      translate('<div class="view-toolbar sessions-toolbar"><span>Все сессии</span><span class="session-count">') +
      sessions.length +
      "</span></div>" +
      (sessions.length
        ? '<div class="cards-grid">' +
          sessions
            .map((s) => {
              const a = analyzeTrades(s.snapshot?.trades || [], {
                  capital: s.capital,
                }),
                i = s.snapshot?.index || 0;
              return (
                '<article class="content-card session-card"><div class="card-top"><span class="symbol-pill">' +
                esc(s.comparisonDatasetId ? "NQ + ES" : s.symbol) +
                '</span><span class="muted">' +
                date(s.updatedAt) +
                "</span></div><h3>" +
                esc(s.name) +
                '</h3><p class="muted session-period">' +
                esc(s.from) +
                " → " +
                esc(s.to) +
                " · " +
                (s.session === "rth" ? "RTH" : translate("Все сессии")) +
                '</p><div class="session-result"><strong class="' +
                (a.net < 0 ? "negative" : a.net > 0 ? "positive" : "") +
                '">' +
                money(a.net) +
                "</strong><span>" +
                a.count +
                translate(" сделок · ") +
                (s.snapshot?.position ? translate("Есть позиция") : translate("Свеча ") + (i + 1)) +
                '</span></div><p class="muted session-strategy">' +
                esc(
                  strategies().find((p: any) => p.id === s.strategyId)?.name ||
                    translate("Без стратегии"),
                ) +
                '</p><div class="card-actions"><button class="button secondary compact" data-resume="' +
                esc(s.id) +
                translate('">Продолжить →</button><button class="icon-button" data-rerun="') +
                esc(s.id) +
                translate('" title="Новый проход с сохранением результата" aria-label="Повторить сессию">↺</button><button class="icon-button" data-delete-session="') +
                esc(s.id) +
                translate('" title="Удалить сессию" aria-label="Удалить сессию">×</button></div></article>')
              );
            })
            .join("") +
          "</div>"
        : translate('<div class="sessions-empty"><div class="empty-market" aria-hidden="true"><svg viewBox="0 0 240 112" fill="none"><path class="empty-grid" d="M0 28h240M0 56h240M0 84h240M40 0v112M80 0v112M120 0v112M160 0v112M200 0v112"/><g class="empty-candles"><path d="M48 68v28M80 41v45M112 52v34M144 26v41M176 13v40M208 22v37"/><rect x="42" y="75" width="12" height="12" rx="2"/><rect x="74" y="52" width="12" height="23" rx="2"/><rect x="106" y="59" width="12" height="16" rx="2"/><rect x="138" y="35" width="12" height="20" rx="2"/><rect x="170" y="23" width="12" height="16" rx="2"/><rect x="202" y="30" width="12" height="17" rx="2"/></g></svg></div><h2>Сессий пока нет</h2></div>'));
  }
  function renderJournal() {
    const rows = filterTrades(allTrades(), filter),
      summary = analyzeTrades(rows);
    $("tradeCount").textContent = String(rows.length);
    $("export").disabled = !rows.length;
    $("journalSummary").innerHTML =
      translate('<div class="journal-metrics"><span>Результат <strong class="') +
      (summary.net < 0 ? "negative" : "positive") +
      '">' +
      money(summary.net) +
      translate("</strong></span><span>Сделок <strong>") +
      summary.count +
      "</strong></span><span>Win rate <strong>" +
      (summary.winRate === null ? "—" : summary.winRate.toFixed(1) + "%") +
      translate("</strong></span><span>Средний R <strong>") +
      (summary.avgR === null ? "—" : summary.avgR.toFixed(2) + "R") +
      "</strong></span></div>";
    $("emptyJournal").hidden = !!rows.length;
    $("tradeRows").innerHTML = rows
      .slice()
      .sort((a, b) => b.exitTime - a.exitTime)
      .map(
        (t) =>
          translate('<tr tabindex="0" role="button" aria-label="Открыть сделку ') +
          esc(t.symbol) +
          '" data-trade-id="' +
          esc(t.id) +
          '" data-session-id="' +
          esc(t.sessionId) +
          '"><td><strong>' +
          esc(t.symbol) +
          "</strong><small>" +
          time(t.time) +
          '</small></td><td><span class="side-tag ' +
          (t.side === -1 ? "sell" : "") +
          '">' +
          (t.side === 1 ? "Long" : "Short") +
          "</span></td><td>" +
          t.qty +
          '</td><td class="mono">' +
          decimal(t.entry) +
          '</td><td class="mono">' +
          decimal(t.exit) +
          '</td><td class="mono ' +
          (t.pnl >= 0 ? "positive" : "negative") +
          '">' +
          money(t.pnl) +
          "</td><td>" +
          (Number.isFinite(t.r) ? decimal(t.r) + "R" : "—") +
          "</td><td>" +
          esc(t.strategyName) +
          '<small class="trade-row-note">' +
          esc(translate(t.reason)) +
          (t.ambiguous ? translate(" · OHLC неопределённость") : "") +
          "</small></td></tr>",
      )
      .join("");
  }
  function initFilters() {
    const box = $("journalFilters");
    box.innerHTML =
      translate('<div class="filter-grid"><label class="filter-control">Поиск<input id="journalSearch" type="search" placeholder="Сессия, стратегия, заметка"></label><label class="filter-control">Инструмент<select id="journalSymbol"><option value="">Все</option><option>NQ</option><option>ES</option></select></label><label class="filter-control">Стратегия<select id="journalStrategy">') +
      options("", false).replace(/^/, translate('<option value="">Все</option>')) +
      translate('</select></label><label class="filter-control">С даты<input id="journalFrom" type="date"></label><label class="filter-control">По дату<input id="journalTo" type="date"></label><label class="filter-control">Тег<input id="journalTag" placeholder="например, дисциплина"></label></div>');
    const read = () => {
      filter = {
        search: $("journalSearch").value,
        symbol: $("journalSymbol").value,
        strategyId: $("journalStrategy").value,
        from: $("journalFrom").value,
        to: $("journalTo").value,
        tag: $("journalTag").value.trim(),
      };
      renderJournal();
    };
    for (const el of box.querySelectorAll<HTMLInputElement>("input,select"))
      el.addEventListener("input", read);
  }
  function openTrade(sessionId: any, tradeId: any) {
    selectedTrade = { sessionId, tradeId };
    const s = ws().sessions.find((x: any) => x.id === sessionId),
      t = s?.snapshot?.trades.find((x: any) => x.id === tradeId);
    if (!t) throw Error(translate("Сделка не найдена"));
    const a = s.annotations?.[t.id] || {},
      p = strategies().find(
        (x: any) => x.id === (a.strategyId ?? s.strategyId),
      );
    const dialog = $("tradeDetailDialog");
    dialog.innerHTML =
      '<form id="tradeNoteForm"><div class="dialog-header"><div><p class="eyebrow">TRADE REVIEW · ' +
      esc(s.name) +
      "</p><h2>" +
      esc(t.symbol) +
      " · " +
      (t.side === 1 ? "Long" : "Short") +
      translate('</h2></div><button class="icon-button" type="button" data-detail-close aria-label="Закрыть">×</button></div><div class="trade-detail-stats"><strong class="') +
      (t.pnl >= 0 ? "positive" : "negative") +
      '">' +
      money(t.pnl) +
      "</strong><span>" +
      (Number.isFinite(t.r) ? decimal(t.r) + "R" : "—") +
      "</span><span>" +
      t.qty +
      translate(' контр.</span></div><p class="muted">') +
      time(t.time) +
      " → " +
      time(t.exitTime) +
      " ET · " +
      esc(translate(t.reason)) +
      translate('</p><div class="field-pair"><label>Вход<input readonly value="') +
      decimal(t.entry) +
      translate('"></label><label>Выход<input readonly value="') +
      decimal(t.exit) +
      translate('"></label></div><p class="dialog-note muted">Комиссия ') +
      money(t.fees) +
      " · " +
      (t.exits?.length || 1) +
      translate(" исполнений выхода") +
      (t.ambiguous
        ? translate(" · В минутной свече порядок касания уровней неизвестен; выбран консервативный SL.")
        : "") +
      translate('</p><label for="tradeStrategy">Стратегия</label><select id="tradeStrategy">') +
      options(a.strategyId ?? s.strategyId) +
      '</select><div id="tradeRules" class="trade-rules">' +
      (p?.rules || [])
        .map(
          (r: any, i: any) =>
            '<label><input type="checkbox" data-rule="' +
            i +
            '" ' +
            (a.checklist?.[i] ? "checked" : "") +
            ">" +
            esc(r) +
            "</label>",
        )
        .join("") +
      translate('</div><label for="tradeTags">Теги через запятую</label><input id="tradeTags" maxlength="600" placeholder="сетап, ошибка, дисциплина" value="') +
      esc((a.tags || []).join(", ")) +
      translate('"><label for="tradeNote">Разбор сделки</label><textarea id="tradeNote" rows="6" maxlength="10000" placeholder="Контекст → условия входа → исполнение → вывод">') +
      esc(a.notes || "") +
      '</textarea><div id="tradeAttachments" class="attachment-grid">' +
      (Array.isArray(a.attachments) ? a.attachments : [])
        .filter((x: any) => attachmentURL(x.url))
        .map(
          (x: any) =>
            '<a href="' +
            esc(x.url) +
            '" target="_blank" rel="noopener"><img src="' +
            esc(x.url) +
            '" alt="' +
            esc(x.name || translate("Скриншот сделки")) +
            '" loading="lazy"></a>',
        )
        .join("") +
      translate('</div><div class="card-actions"><label class="button secondary compact attachment-label">＋ Изображение<input id="tradeImage" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><button type="button" id="tradeCapture" class="button secondary compact">Скриншот текущего чарта</button></div><p id="attachmentStatus" class="muted dialog-note"></p><button class="button primary full" type="submit">Сохранить разбор</button></form>');
    const saveAnnotation = () => {
      s.annotations ||= {};
      s.annotations[t.id] = {
        ...(s.annotations[t.id] || {}),
        strategyId: $("tradeStrategy").value,
        notes: $("tradeNote").value.trim(),
        tags: [
          ...new Set(
            $("tradeTags")
              .value.split(",")
              .map((x: any) => x.trim().slice(0, 64))
              .filter(Boolean),
          ),
        ].slice(0, 20),
        checklist: Object.fromEntries(
          [...dialog.querySelectorAll<HTMLElement>("[data-rule]")].map((x) => [
            x.dataset.rule,
            (x as HTMLInputElement).checked,
          ]),
        ),
      };
      s.updatedAt = new Date().toISOString();
      changed();
    };
    $("tradeNoteForm").onsubmit = (e) => {
      e.preventDefault();
      saveAnnotation();
      dialog.close();
      toast(translate("Разбор сохранён"));
    };
    dialog.querySelector<HTMLElement>("[data-detail-close]").onclick = () =>
      dialog.close();
    $("tradeStrategy").onchange = () => {
      const p = strategies().find(
        (x: any) => x.id === $("tradeStrategy").value,
      );
      $("tradeRules").innerHTML = (p?.rules || [])
        .map(
          (r: any, i: any) =>
            '<label><input type="checkbox" data-rule="' +
            i +
            '">' +
            esc(r) +
            "</label>",
        )
        .join("");
    };
    async function upload(file: any) {
      saveAnnotation();
      const a = s.annotations[t.id];
      if ((a.attachments || []).length >= 10)
        throw Error(translate("Не более 10 изображений на сделку"));
      $("attachmentStatus").textContent = translate("Сохраняю изображение…");
      const result = await store.attachment(file);
      a.attachments ||= [];
      a.attachments.push(result);
      changed();
      $("attachmentStatus").textContent = translate("Изображение сохранено");
      $("tradeAttachments").insertAdjacentHTML(
        "beforeend",
        '<a href="' +
          esc(result.url) +
          '" target="_blank" rel="noopener"><img src="' +
          esc(result.url) +
          translate('" alt="Скриншот сделки"></a>'),
      );
    }
    $("tradeImage").onchange = safe(async () => {
      const file = $("tradeImage").files[0];
      if (file) await upload(file);
    });
    $("tradeCapture").onclick = safe(async () => {
      const file = await capture();
      await upload(file);
    });
    dialog.showModal();
  }
  function renderPlaybooks() {
    const box = $("playbooksContent");
    box.innerHTML =
      translate('<div class="view-toolbar"><p class="muted">Определите условия до сделки и проверяйте соблюдение правил после.</p><button class="button primary" data-create-strategy>＋ Создать стратегию</button></div>') +
      (strategies().length
        ? '<div class="cards-grid">' +
          strategies()
            .map((p: any) => {
              const trades = allTrades().filter(
                  (t: any) => t.strategyId === p.id,
                ),
                a = analyzeTrades(trades);
              return (
                '<article class="content-card playbook-card"><span class="eyebrow">PLAYBOOK</span><h3>' +
                esc(p.name) +
                '</h3><p class="muted">' +
                esc(p.description || translate("Добавьте описание модели")) +
                '</p><ul class="rule-preview">' +
                p.rules.map((r: any) => "<li>" + esc(r) + "</li>").join("") +
                '</ul><div class="session-result"><strong class="' +
                (a.net < 0 ? "negative" : "positive") +
                '">' +
                money(a.net) +
                "</strong><span>" +
                a.count +
                translate(" сделок · ") +
                (a.winRate === null ? "—" : a.winRate.toFixed(0) + "% WR") +
                '</span></div><button class="button secondary compact" data-edit-strategy="' +
                esc(p.id) +
                translate('">Изменить правила</button></article>')
              );
            })
            .join("") +
          "</div>"
        : translate('<div class="empty-state"><h3>Ваши правила, ваша статистика</h3><p>Создайте первый playbook: контекст, вход, риск и выход. Затем назначайте его сессиям и сделкам.</p><button class="button primary" data-create-strategy>Создать стратегию</button></div>'));
  }
  function editStrategy(id?: any) {
    const existing = strategies().find((p: any) => p.id === id);
    let dialog: any = document.getElementById("playbookDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "playbookDialog";
      document.body.append(dialog);
    }
    dialog.innerHTML =
      '<form id="playbookForm"><div class="dialog-header"><h2>' +
      (existing ? translate("Редактировать") : translate("Новая")) +
      translate(' стратегия</h2><button type="button" class="icon-button" data-playbook-close>×</button></div><label for="playbookName">Название</label><input id="playbookName" required maxlength="100" value="') +
      esc(existing?.name || "") +
      translate('" placeholder="Например, NY reversal"><label for="playbookDescription">Описание модели</label><textarea id="playbookDescription" maxlength="2000" rows="3">') +
      esc(existing?.description || "") +
      translate('</textarea><label for="playbookRules">Правила · по одному на строку</label><textarea id="playbookRules" maxlength="5000" rows="7" placeholder="Контекст определён\nУсловия входа выполнены\nРиск соответствует плану\nУровень отмены идеи задан">') +
      esc((existing?.rules || []).join("\n")) +
      translate('</textarea><button type="submit" class="button primary full">Сохранить стратегию</button></form>');
    dialog.querySelector("[data-playbook-close]").onclick = () =>
      dialog.close();
    $("playbookForm").onsubmit = (e) => {
      e.preventDefault();
      const p = {
        id: existing?.id || uid(),
        name: $("playbookName").value.trim(),
        description: $("playbookDescription").value.trim(),
        rules: $("playbookRules")
          .value.split("\n")
          .map((x: any) => x.trim().slice(0, 240))
          .filter(Boolean)
          .slice(0, 30),
      };
      if (!p.name) return;
      if (existing) Object.assign(existing, p);
      else {
        if (strategies().length >= 100) throw Error(translate("Не более 100 стратегий"));
        ws().playbooks.push(p);
      }
      changed();
      fillStrategies();
      dialog.close();
      renderPlaybooks();
    };
    dialog.showModal();
  }
  function renderView() {
    if (!loaded) return;
    updateHeader();
    if (view === "sessions") renderSessions();
    if (view === "journal") {
      if (!document.getElementById("journalSearch")) initFilters();
      renderJournal();
    }
    if (view === "analytics") {
      const box = $("analyticsContent");
      box.innerHTML =
        translate('<div class="view-toolbar"><label class="filter-control">Область анализа<select id="analyticsScope"><option value="all">Все сессии</option>') +
        ws()
          .sessions.map(
            (s: any) =>
              '<option value="' + esc(s.id) + '">' + esc(s.name) + "</option>",
          )
          .join("") +
        translate('</select></label><span class="muted">Только закрытые сделки · результаты с учётом комиссии</span></div><div id="analyticsCharts"></div>');
      const draw = () => {
        const id = $("analyticsScope").value,
          s = ws().sessions.find((x: any) => x.id === id);
        renderAnalytics(
          $("analyticsCharts"),
          id === "all"
            ? allTrades()
            : allTrades().filter((t: any) => t.sessionId === id),
          { capital: s?.capital || 50000 },
        );
      };
      $("analyticsScope").onchange = draw;
      draw();
    }
    if (view === "playbooks") renderPlaybooks();
  }
  document
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) => {
      if (!(b instanceof HTMLAnchorElement)) b.onclick = () => navigate(b.dataset.view);
    });
  window.addEventListener("workspace-route", () => {
    if (loaded) navigate(workspaceView(location.pathname), false);
  });
  document.addEventListener(
    "click",
    safe(async (e: any) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b) return;
      if (b.dataset.product === "new-session") $("setupOpen").click();
      if (b.dataset.product === "import") $("importOpen").click();
      if (b.dataset.openDataset) await openDataset(b.dataset.openDataset);
      if (b.dataset.resume) {
        const s = ws().sessions.find((x: any) => x.id === b.dataset.resume);
        await activate(s);
        ws().settings.activeSessionId = s.id;
        changed();
        navigate("replay");
        updateHeader();
      }
      if (b.dataset.rerun) {
        const s = ws().sessions.find((x: any) => x.id === b.dataset.rerun);
        await activate(s, true);
        navigate("replay");
      }
      if (b.dataset.deleteSession) {
        const s = ws().sessions.find(
          (x: any) => x.id === b.dataset.deleteSession,
        );
        if (active()?.id === s.id) {
          toast(translate("Сначала откройте другую сессию"));
          return;
        }
        if (confirm(translate("Удалить сессию «") + s.name + translate("» вместе с журналом?"))) {
          ws().sessions = ws().sessions.filter((x: any) => x.id !== s.id);
          changed();
        }
      }
      if (b.hasAttribute("data-create-strategy")) editStrategy();
      if (b.dataset.editStrategy) editStrategy(b.dataset.editStrategy);
    }),
  );
  $("tradeRows").onclick = safe((e: any) => {
    const row = e.target.closest("[data-trade-id]");
    if (row) openTrade(row.dataset.sessionId, row.dataset.tradeId);
  });
  $("tradeRows").onkeydown = (e) => {
    if (["Enter", " "].includes(e.key)) {
      e.preventDefault();
      (e.target as HTMLElement)
        .closest<HTMLElement>("[data-trade-id]")
        ?.click();
    }
  };
  $("export").onclick = () =>
    download(
      "eazy-trading-journal.csv",
      csvTrades(filterTrades(allTrades(), filter)),
      "text/csv;charset=utf-8",
    );
  function exportBackup() {
    download(
      "eazy-trading-backup-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(
        {
          eazyTradingBackup: 1,
          exportedAt: new Date().toISOString(),
          workspace: ws(),
        },
        null,
        2,
      ),
    );
    toast(
      translate("Сессии и журнал экспортированы. Рыночные архивы хранятся отдельно в вашем аккаунте."),
    );
  }
  function canSync() {
    return (
      loaded &&
      navigationReady &&
      !applyingRemote &&
      !interacting &&
      !document.hidden &&
      !document.querySelector("dialog[open]") &&
      !document.activeElement?.matches(
        "input, textarea, select, [contenteditable=true]",
      )
    );
  }
  async function applyRemote() {
    if (!pendingRemote || !canSync()) return;
    const previous = pendingRemote;
    const before = previous.sessions.find(
      (s: any) => s.id === previous.settings.activeSessionId,
    );
    const next = active();
    const replayState = (s: any) =>
      s && [
        s.id,
        s.symbol,
        s.datasetId,
        s.comparisonDatasetId,
        s.from,
        s.to,
        s.session,
        s.capital,
        s.snapshot,
        s.drawings,
      ];
    applyingRemote = true;
    const main = document.querySelector<HTMLElement>(".product-main");
    if (main) main.inert = true;
    try {
      fillStrategies();
      if (
        next &&
        JSON.stringify(replayState(before)) !==
          JSON.stringify(replayState(next))
      )
        await activate(next, false, true);
      else if (!next && before && view === "replay") navigate("sessions");
      if (
        ws().settings.chartPreferences &&
        JSON.stringify(previous.settings.chartPreferences) !==
          JSON.stringify(ws().settings.chartPreferences)
      )
        setPreferences(ws().settings.chartPreferences);
      renderView();
      updateHeader();
      pendingRemote = null;
    } finally {
      applyingRemote = false;
      if (main) main.inert = false;
    }
  }
  store.canSync = canSync;
  store.onRemote = async (previous: any) => {
    pendingRemote ||= previous;
    await applyRemote();
  };
  async function syncNow() {
    if (!canSync()) return;
    if (pendingRemote) {
      await applyRemote();
      return;
    }
    if (await store.refresh()) {
      if (pendingRemote) await applyRemote();
      if (store.dirty) await store.flush();
    }
  }
  window.addEventListener("pointerdown", () => {
    interacting = true;
  });
  window.addEventListener("pointerup", () => {
    interacting = false;
  });
  window.addEventListener("pointercancel", () => {
    interacting = false;
  });
  window.addEventListener("blur", () => {
    interacting = false;
  });
  window.addEventListener("online", safe(syncNow));
  window.addEventListener("focus", safe(syncNow));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void safe(syncNow)();
  });
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith("eazy-trading-workspace-v1:"))
      void safe(syncNow)();
  });
  setInterval(() => void safe(syncNow)(), 5000);
  window.addEventListener("pagehide", () => {
    store.cache();
    if (store.dirty && !store.conflict)
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store.value),
        keepalive: true,
      }).catch(() => {});
  });
  return {
    store,
    active,
    allTrades,
    options,
    createSession,
    saveReplay,
    updateHeader,
    navigate,
    ready() {
      navigationReady = true;
      navigate(workspaceView(location.pathname), false);
    },
    async load() {
      await store.load();
      loaded = true;
      fillStrategies();
      if (ws().settings.chartPreferences)
        setPreferences(ws().settings.chartPreferences);
      navigate(workspaceView(location.pathname), false);
      return active();
    },
    resumed(id: any) {
      if (ws().settings.activeSessionId !== id) {
        ws().settings.activeSessionId = id;
        if (!applyingRemote) changed();
      }
      fillStrategies();
      updateHeader();
    },
    saveDrawings(drawings: any) {
      if (!loaded || applyingRemote || !active()) return;
      active().drawings = drawings;
      store.changed();
    },
    preferencesChanged(p: any) {
      if (!loaded || applyingRemote) return;
      if (JSON.stringify(ws().settings.chartPreferences) === JSON.stringify(p)) return;
      ws().settings.chartPreferences = structuredClone(p);
      store.changed();
    },
    registerDataset(id: any, d: any, symbol: any) {
      ws().settings.datasets ||= {};
      ws().settings.datasets[id] = {
        id,
        symbol,
        name: d.name,
        source: d.source,
        from: d.days[0],
        to: d.days.at(-1),
        count: d.bars.length,
      };
      if (loaded) store.changed();
    },
    async saveDataset(d: any, symbol: any) {
      const id = uid();
      await store.uploadDataset({
        id,
        symbol,
        name: d.name,
        source: d.source,
        metadata: d.metadata || {},
        bars: d.bars,
      });
      d.id = id;
      this.registerDataset(id, d, symbol);
      return id;
    },
    async readDataset(id: any, range: any) {
      return range
        ? store.datasetRange(id, range.from, range.to)
        : store.dataset(id);
    },
    registerArchive(d: any) {
      ws().settings.datasets ||= {};
      const entry = {
        id: d.id,
        symbol: d.symbol,
        name: d.name,
        source: d.source,
        kind: "archive",
        months: d.months || [],
        from: dayKey(d.firstTime),
        to: dayKey(d.lastTime),
        count: d.count,
      };
      if (
        JSON.stringify(ws().settings.datasets[d.id]) !== JSON.stringify(entry)
      ) {
        ws().settings.datasets[d.id] = entry;
        store.changed();
      }
    },
    refresh() {
      if (view === "journal") renderJournal();
      if (view === "sessions") renderSessions();
    },
    reviewLatest() {
      const s = active(),
        t = s?.snapshot?.trades.at(-1);
      if (t) openTrade(s.id, t.id);
      else toast(translate("Сначала закройте сделку"));
    },
  };
}
