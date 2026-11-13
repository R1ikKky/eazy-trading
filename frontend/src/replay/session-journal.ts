import { t, locale, currentLanguage } from "../i18n/language";
import { escapeHTML as esc } from "./workspace-store";

const money = (v: number) =>
  (v < 0 ? "−" : "") +
  "$" +
  Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const price = (v: number | null) => (Number.isFinite(v) ? v!.toFixed(2) : "—");
const tone = (v: number) => (v > 0 ? "positive" : v < 0 ? "negative" : "");
const side = (value: number) =>
  `<span class="replay-journal-side${value === -1 ? " is-short" : ""}">${value === 1 ? "Long" : "Short"}</span>`;

export function createSessionJournal(
  onReview: (session: string, trade: string) => void,
) {
  const panel = document.getElementById("replayJournal")!;
  const hide = document.getElementById("replayJournalHide")!;
  const show = document.getElementById("replayJournalShow")!;
  const caption = document.getElementById("replayJournalSession")!;
  const summary = document.getElementById("replayJournalSummary")!;
  const current = document.getElementById("replayJournalCurrent")!;
  const list = document.getElementById("replayJournalTrades")!;
  let owner = "local",
    collapsed = innerWidth <= 1000;
  try {
    owner = sessionStorage.getItem("replay-user-id") || "local";
    const saved = localStorage.getItem("eazy-trading-session-journal:" + owner);
    if (saved !== null) collapsed = saved === "collapsed";
  } catch {}
  let latest: any = null,
    displayedSessionId: string | undefined,
    listKey = "",
    positionKey = "";
  function placeReveal() {
    if (!collapsed) return;
    const plot = document.getElementById("chart")?.getBoundingClientRect();
    const grid = panel.parentElement!.getBoundingClientRect();
    if (plot?.height)
      show.style.top = Math.round(plot.top + plot.height / 2 - grid.top) + "px";
  }
  function toggle(value: boolean, persist = true) {
    collapsed = value;
    panel.hidden = value;
    panel.inert = value;
    show.hidden = !value;
    hide.setAttribute("aria-expanded", String(!value));
    show.setAttribute("aria-expanded", String(!value));
    if (persist) {
      try {
        localStorage.setItem(
          "eazy-trading-session-journal:" + owner,
          value ? "collapsed" : "open",
        );
      } catch {}
      if (!value) render(latest, true);
      (value ? show : hide).focus({ preventScroll: true });
    }
    requestAnimationFrame(placeReveal);
  }
  hide.onclick = () => toggle(true);
  show.onclick = () => toggle(false);
  const chart = document.getElementById("chart");
  if (chart) new ResizeObserver(placeReveal).observe(chart);
  window.addEventListener("resize", placeReveal);
  list.addEventListener("click", (event) => {
    const row = (event.target as Element).closest<HTMLElement>(
      "[data-session-trade]",
    );
    if (row && latest) onReview(latest.id, row.dataset.sessionTrade!);
  });
  function render(session: any, force = false) {
    latest = session;
    if (collapsed) return;
    caption.textContent = session?.name || t("Текущая сессия");
    caption.title = session?.name || "";
    const snapshot = session?.snapshot || {},
      trades = snapshot.trades || [];
    const nextListKey = JSON.stringify([
      currentLanguage(),
      session?.id,
      trades.length,
      trades.at(-1)?.id,
      trades.at(-1)?.pnl,
    ]);
    if (force || nextListKey !== listKey) {
      listKey = nextListKey;
      const net = trades.reduce(
        (sum: number, trade: any) => sum + trade.pnl,
        0,
      );
      summary.innerHTML = `<div><span>${t("Закрытый P&L")}</span><strong class="${tone(net)}">${money(net)}</strong></div><div><span>${t("Сделок")}</span><strong>${trades.length}</strong></div>`;
      const focused = (
        document.activeElement as HTMLElement
      )?.closest<HTMLElement>("[data-session-trade]")?.dataset.sessionTrade;
      const top = displayedSessionId === session?.id ? list.scrollTop : 0,
        height = list.scrollHeight;
      displayedSessionId = session?.id;
      const formatter = new Intl.DateTimeFormat(locale(), {
        timeZone: "America/New_York",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      const time = (value: number) => formatter.format(new Date(value * 1000));
      list.innerHTML = trades.length
        ? trades
            .slice()
            .reverse()
            .map((trade: any) => {
              const note = session.annotations?.[trade.id]?.notes;
              return `<button type="button" class="replay-journal-trade" data-session-trade="${esc(trade.id)}" aria-label="${t("Открыть сделку")} ${esc(trade.symbol)} ${esc(time(trade.time))}"><span><strong>${esc(trade.symbol)} ${side(trade.side)}</strong><b class="${tone(trade.pnl)}">${money(trade.pnl)}</b></span><span class="replay-journal-prices"><span>${price(trade.entry)} → ${price(trade.exit)}</span><span>${Number.isFinite(trade.r) ? trade.r.toFixed(2) + "R" : "—"}</span></span><span class="replay-journal-meta"><span>${esc(time(trade.time))} ET</span><span>${trade.qty} ${t("контр.")} · ${esc(t(trade.reason))}</span></span>${note ? `<small>${esc(note)}</small>` : ""}</button>`;
            })
            .join("")
        : `<p class="replay-journal-empty">${t(session ? "Здесь появятся закрытые сделки текущей сессии." : "Начните сессию, чтобы увидеть её журнал.")}</p>`;
      if (top > 0) list.scrollTop = top + list.scrollHeight - height;
      else list.scrollTop = 0;
      if (focused)
        list
          .querySelector<HTMLElement>(
            `[data-session-trade="${CSS.escape(focused)}"]`,
          )
          ?.focus({ preventScroll: true });
    }
    const nextPositionKey = JSON.stringify([
      currentLanguage(),
      session?.id,
      snapshot.position,
      snapshot.pending,
    ]);
    if (nextPositionKey !== positionKey) {
      positionKey = nextPositionKey;
      const order = snapshot.position || snapshot.pending;
      current.hidden = !order;
      current.innerHTML = order
        ? `<span>${t(snapshot.position ? "Открытая позиция" : "Отложенная заявка")}</span><strong>${esc(session.symbol)} ${side(order.side)} · ${order.qty} ${t("контр.")}</strong><dl><div><dt>${t("Вход")}</dt><dd>${price(order.entry ?? order.entryPrice)}</dd></div><div><dt>SL</dt><dd>${price(order.sl)}</dd></div><div><dt>TP</dt><dd>${price(order.tp)}</dd></div></dl>`
        : "";
    }
    placeReveal();
  }
  toggle(collapsed, false);
  return { render };
}
