import { t as translate } from "../i18n/language";
import { contracts, aggregate } from "./engine";
import {
  settingsColor,
  chartDate,
  chartTimeScale,
  isRegularSession,
  barTime,
} from "./settings-model";
import { escapeHTML as esc } from "./workspace-store";
import {
  createReplayScaleLock,
  releaseOnPriceAxisReset,
} from "./replay-scale-lock";
import { includeTradeLevels } from "./trade-levels";
const money = (v: any) =>
  (v < 0 ? "−" : "") + "$" + Math.abs(Number(v) || 0).toFixed(2);
export function renderPosition(box: any, replay: any, symbol: any) {
  const p = replay.position;
  if (p) {
    const pnl =
      (replay.current.close - p.entry) *
        p.side *
        contracts[symbol].point *
        p.qty -
      2 * p.fee * p.qty;
    box.classList.add("active");
    box.innerHTML =
      '<div class="pos-row"><strong>' +
      symbol +
      " · " +
      (p.side === 1 ? "LONG" : "SHORT") +
      "</strong><span>" +
      p.qty +
      " / " +
      p.initialQty +
      translate(' контр.</span></div><strong class="pos-pnl ') +
      (pnl >= 0 ? "positive" : "negative") +
      '">' +
      money(pnl) +
      translate(
        "</strong><p>Открытый результат с комиссией · частично реализовано ",
      ) +
      money(p.realizedNet) +
      translate(
        '</p><div class="pos-row"><span>Вход</span><span class="mono">',
      ) +
      p.entry.toFixed(2) +
      '</span></div><div class="protection-fields"><label>SL<input type="number" data-position-sl step="0.25" value="' +
      p.sl +
      '"></label><label>TP<input type="number" data-position-tp step="0.25" value="' +
      p.tp +
      '"></label><button class="button secondary compact" data-action="protect" ' +
      (replay.ended ? "disabled" : "") +
      translate(
        '>Применить уровни</button></div><div class="pos-actions"><button data-action="be" ',
      ) +
      (replay.ended ? "disabled" : "") +
      '>BE</button><button data-action="be-costs" ' +
      (replay.ended ? "disabled" : "") +
      translate(
        '>BE + издержки</button></div><div class="partial-controls"><label>Закрыть контрактов<input type="number" data-close-qty min="1" max="',
      ) +
      p.qty +
      '" step="1" value="' +
      Math.max(1, Math.floor(p.qty / 2)) +
      '"></label><button class="button secondary compact" data-action="partial" ' +
      (replay.ended || replay.closePending ? "disabled" : "") +
      translate(
        '>Часть</button></div><div class="pos-actions"><button data-action="close" ',
      ) +
      (replay.ended || replay.closePending ? "disabled" : "") +
      ">" +
      (replay.closePending
        ? translate("Выход ожидается")
        : translate("Закрыть всё")) +
      "</button></div>" +
      (replay.ended
        ? translate(
            "<p>Период завершён · выход возможен только в новой свече.</p>",
          )
        : "");
  } else if (replay.pending) {
    const q = replay.pending;
    box.classList.add("active");
    box.innerHTML =
      '<div class="pos-row"><strong>' +
      (q.side === 1 ? "LONG" : "SHORT") +
      " · " +
      esc(q.kind.toUpperCase()) +
      "</strong><span>" +
      q.qty +
      translate(" контр.</span></div><p>") +
      (q.kind === "market"
        ? translate("На следующем открытии")
        : translate("Уровень активации ") + q.entryPrice.toFixed(2)) +
      translate('</p><div class="pos-row"><span>Стоп / тейк</span><span>') +
      q.stop +
      " / " +
      q.target +
      translate(
        ' пт</span></div><div class="pos-actions"><button data-action="cancel">Отменить заявку</button></div>',
      );
  } else {
    box.classList.remove("active");
    box.innerHTML = translate("<strong>Вне позиции</strong>");
  }
}
export function createComparison({
  primary,
  primarySeries,
  getPrimaryBars = () => [],
  getTimeframe = () => 1,
  getDatasets,
  getSymbol,
  getTime,
  getPreferences,
  onShow,
  getDisplaySymbol,
  onChartReady,
  onChartRender,
  onVisibilityChange,
  getPriceLevels = () => [],
}: any) {
  const viewportScale = createReplayScaleLock();
  let chart: any,
    series: any,
    visible: any = false,
    minutes = null,
    loadVersion: any = 0,
    rows = [],
    viewScope = "",
    renderedTime = 0,
    syncingCrosshair = false;
  const button = document.getElementById("compareToggle"),
    panes = document.getElementById("chartPanes"),
    host = document.createElement("section");
  host.className = "comparison-card chart-pane";
  host.hidden = true;
  host.setAttribute("aria-label", translate("Второй инструмент"));
  host.innerHTML = translate(
    '<div class="comparison-header"><button type="button" class="pane-instrument-trigger" id="comparisonTitle">ES</button><strong class="comparison-price" id="comparisonPrice"></strong></div><div id="compareChart" class="comparison-chart"></div><p id="compareNotice" class="pane-notice muted"></p>',
  );
  panes.append(host);
  const title = document.getElementById("comparisonTitle"),
    notice = document.getElementById("compareNotice"),
    container = document.getElementById("compareChart");
  const interval: any = () => minutes ?? getTimeframe();
  function moveCrosshair(
    param: any,
    target: any,
    targetSeries: any,
    bars: any,
    tf: any,
  ) {
    if (!visible || syncingCrosshair || !target || !targetSeries) return;
    syncingCrosshair = true;
    try {
      const time = Number.isFinite(param.time)
          ? barTime(param.time, tf, getPreferences().session)
          : null,
        bar = param.point && bars.find((b) => b.time === time);
      // A freshly mounted/hidden pane can have bars before its scales have
      // calculated coordinates. Lightweight Charts rejects a synthetic cursor then.
      const priceReady =
        bar &&
        (!targetSeries.priceToCoordinate ||
          targetSeries.priceToCoordinate(bar.close) !== null);
      const timeReady =
        bar &&
        (!target.timeScale().timeToCoordinate ||
          target.timeScale().timeToCoordinate(bar.time) !== null);
      if (bar && priceReady && timeReady)
        target.setCrosshairPosition(bar.close, bar.time, targetSeries);
      else target.clearCrosshairPosition();
    } finally {
      syncingCrosshair = false;
    }
  }
  primary.subscribeCrosshairMove((param) =>
    moveCrosshair(param, chart, series, rows, interval()),
  );
  function render() {
    if (!visible) return;
    const L = window.LightweightCharts,
      p = getPreferences(),
      symbol = getDisplaySymbol?.() || (getSymbol() === "NQ" ? "ES" : "NQ"),
      d = getDatasets()[symbol],
      now = getTime(),
      tf = interval();
    title.textContent = symbol + " · " + tf + "m";
    host.setAttribute("aria-label", translate("График ") + symbol);
    const priceLabel = document.getElementById("comparisonPrice");
    if (priceLabel)
      priceLabel.textContent = rows.at(-1)?.close?.toFixed(2) || "";
    if (!chart) {
      chart = L.createChart(container, {
        autoSize: true,
        layout: { attributionLogo: true },
        timeScale: {
          timeVisible: true,
          shiftVisibleRangeOnNewBar: false,
          rightOffset: 8,
          barSpacing: 8,
        },
        rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.12 } },
      });
      series = chart.addSeries(L.CandlestickSeries, {
        autoscaleInfoProvider: (base: any) =>
          viewportScale.apply(() =>
            includeTradeLevels(
              base(),
              getPriceLevels(
                getDisplaySymbol?.() || (getSymbol() === "NQ" ? "ES" : "NQ"),
              ),
            ),
          ),
        priceFormat: { type: "price", precision: 2, minMove: 0.25 },
        priceLineVisible: false,
      });
      releaseOnPriceAxisReset(
        chart,
        container,
        () => viewportScale.release(),
        () => {
          if (rows.length) series.update(rows.at(-1));
        },
      );
      onChartReady?.({
        id: "comparison",
        chart,
        series,
        container,
        getBars: () => rows,
        getSymbol: () =>
          getDisplaySymbol?.() || (getSymbol() === "NQ" ? "ES" : "NQ"),
        getTimeframe: interval,
      });
      chart.subscribeCrosshairMove((param) =>
        moveCrosshair(
          param,
          primary,
          primarySeries,
          getPrimaryBars(),
          getTimeframe(),
        ),
      );
    }
    const scope = symbol + ":" + (d?.id || "") + ":" + tf + ":" + p.session,
      previous: any = rows,
      viewport =
        scope === viewScope && now >= renderedTime
          ? chart.timeScale().getVisibleLogicalRange()
          : null;
    if (scope !== viewScope || now < renderedTime) viewportScale.release();
    {
      chart.applyOptions({
        layout: {
          background: { type: "solid", color: settingsColor(p, "background") },
          textColor: settingsColor(p, "text"),
          fontSize: p.fontSize,
          fontFamily: "IBM Plex Mono, monospace",
        },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        localization: { timeFormatter: (t) => chartDate(t, p) },
        timeScale: chartTimeScale(p),
      });
      const revealed = (d?.bars || [])
        .filter(
          (b) =>
            b.time <= now && (p.session !== "rth" || isRegularSession(b.time)),
        )
        .slice(-30000);
      series.applyOptions({
        upColor: settingsColor(p, "up"),
        downColor: settingsColor(p, "down"),
        borderUpColor: settingsColor(p, "borderUp"),
        borderDownColor: settingsColor(p, "borderDown"),
        wickUpColor: settingsColor(p, "wickUp"),
        wickDownColor: settingsColor(p, "wickDown"),
        borderVisible: p.borders,
        wickVisible: p.wicks,
      });
      rows = aggregate(revealed, tf, (t, m) => barTime(t, m, p.session));
      series.setData(rows);
      if (rows.length) {
        let range = {
          from: Math.max(-3, rows.length - 90),
          to: rows.length + (p.marginRight ?? 10),
        };
        if (
          viewport &&
          previous.length &&
          rows[0].time <= previous.at(-1).time
        ) {
          const dropped: any =
              rows[0].time > previous[0].time
                ? previous.findIndex((b) => b.time >= rows[0].time)
                : 0,
            shift = -Math.max(0, dropped);
          range = { from: viewport.from + shift, to: viewport.to + shift };
        }
        chart.timeScale().setVisibleLogicalRange(range);
        notice.textContent =
          translate("Последняя свеча: ") +
          chartDate(revealed.at(-1).time, p) +
          (now - revealed.at(-1).time > 300
            ? translate(" · есть разрыв в данных")
            : "");
      } else
        notice.textContent =
          translate("Для ") +
          symbol +
          translate(" нет данных до текущего момента. Выберите другой период.");
    }
    viewScope = scope;
    renderedTime = now;
    if (priceLabel)
      priceLabel.textContent =
        rows.at(-1)?.close?.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) || "—";
    onChartRender?.();
  }
  async function reload() {
    if (!visible) return;
    const request = ++loadVersion;
    notice.textContent = translate("Загружаю второй инструмент…");
    try {
      await onShow?.();
      if (request === loadVersion) render();
    } catch (error) {
      if (request === loadVersion) {
        rows = [];
        series?.setData([]);
        notice.textContent = error.message;
      }
    }
  }
  function setVisible(next: any) {
    visible = Boolean(next);
    if (!visible) loadVersion++;
    host.hidden = !visible;
    panes.classList.toggle("is-dual", visible);
    onVisibilityChange?.(visible);
    button.setAttribute("aria-pressed", String(visible));
    button.title = visible
      ? translate("Оставить один график")
      : translate("Два графика");
    button.setAttribute("aria-label", button.title);
    reload();
    window.dispatchEvent(new Event("resize"));
  }
  button.onclick = () => setVisible(!visible);
  return {
    freezeViewport: () => viewportScale.freeze(),
    releaseViewport: () => viewportScale.release(),
    resetViewport: () => {
      viewportScale.release();
      viewScope = "";
    },
    render,
    reload,
    setVisible,
    getTimeframe: interval,
    setTimeframe(value: any) {
      minutes = value;
      render();
    },
    getVisible: () => visible,
  };
}
