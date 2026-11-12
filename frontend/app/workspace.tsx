"use client";
import { t as translate } from "../src/i18n/language";
import { useLanguage } from "../src/i18n/use-language";
import { useEffect, useState } from "react";
import { Mt5Journal } from "./mt5-journal";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  WORKSPACE_ROUTES,
  workspaceView,
} from "../src/replay/workspace-routes";
import { AccountMenu } from "./auth-boundary";
import { AppearanceSettings } from "./appearance-settings";
import { ACCOUNT_DEPOSITS } from "../src/replay/account-deposits";

// The replay terminal owns its chart DOM. Load it only after React mounts the page.
export function ReplayWorkspace() {
  useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const currentView = workspaceView(pathname);
  const pageLabel = {
    replay: "Backtesting",
    sessions: translate("Сессии"),
    journal: translate("Журнал сделок"),
    analytics: translate("Аналитика"),
    playbooks: translate("Стратегии"),
  }[currentView];
  const [journalSource, setJournalSource] = useState<"replay" | "mt5">(
    "replay",
  );
  useEffect(() => {
    const navigate = (event: Event) => {
      const path = (event as CustomEvent<string>).detail;
      if (
        Object.values(WORKSPACE_ROUTES).includes(path) &&
        location.pathname !== path
      )
        router.push(path, { scroll: false });
    };
    window.addEventListener("workspace-navigate", navigate);
    return () => window.removeEventListener("workspace-navigate", navigate);
  }, [router]);
  useEffect(() => {
    window.dispatchEvent(new Event("workspace-route"));
  }, [pathname]);
  useEffect(() => {
    let mounted = true;
    void import("../src/replay/start").then(({ startReplay }) => {
      if (mounted) void startReplay();
    });
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <>
      <header className="workspace-header">
        <div className="workspace-identity">
          <Link
            className="brand workspace-brand"
            href="/sessions"
            aria-label="eazy trading"
          >
            <span className="brand-mark">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8 5 11 7-11 7V5Z" />
              </svg>
            </span>
            <span className="brand-text">
              eazy<span className="brand-light">trading</span>
            </span>
          </Link>
          <span className="workspace-page-separator" aria-hidden="true">
            /
          </span>
          <h1 className="workspace-page-title">{pageLabel}</h1>
        </div>
        <aside className="app-sidebar">
          <nav className="app-nav" aria-label={translate("Основная навигация")}>
            <Link
              href="/replay"
              scroll={false}
              className={
                currentView === "replay" ? "nav-item active" : "nav-item"
              }
              data-view="replay"
              aria-label="Backtesting"
              aria-current={currentView === "replay" ? "page" : false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 5 10 7-10 7V5Z" />
                <path d="M4 5v14" />
              </svg>
              <span>Backtesting</span>
              <span className="nav-live-dot" aria-hidden="true" />
            </Link>
            <Link
              href="/sessions"
              scroll={false}
              className={
                currentView === "sessions" ? "nav-item active" : "nav-item"
              }
              data-view="sessions"
              aria-label={translate("Сессии")}
              aria-current={currentView === "sessions" ? "page" : false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x={4} y={5} width={16} height={15} rx={2} />
                <path d="M8 3v4M16 3v4M4 11h16M8 15h3M14 15h2" />
              </svg>
              <span>{translate("Сессии")}</span>
            </Link>
            <Link
              href="/journal"
              scroll={false}
              className={
                currentView === "journal" ? "nav-item active" : "nav-item"
              }
              data-view="journal"
              aria-label={translate("Журнал")}
              aria-current={currentView === "journal" ? "page" : false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 8h7M8 12h7M8 16h4" />
              </svg>
              <span>{translate("Журнал")}</span>
            </Link>
            <Link
              href="/analytics"
              scroll={false}
              className={
                currentView === "analytics" ? "nav-item active" : "nav-item"
              }
              data-view="analytics"
              aria-label={translate("Аналитика")}
              aria-current={currentView === "analytics" ? "page" : false}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20V5M4 20h17M8 16v-4M13 16V8M18 16V3" />
              </svg>
              <span>{translate("Аналитика")}</span>
            </Link>
          </nav>
          <div className="sidebar-account">
            <AccountMenu />
            <span id="saveStatus" className="save-status" role="status">
              <span className="status-dot" />
              {translate("Сохранено локально")}
            </span>
            <AppearanceSettings />
          </div>
        </aside>
      </header>
      <div className="app-shell">
        <main className="product-main">
          <section
            id="view-replay"
            className="app-view"
            data-app-view="replay"
            hidden={currentView !== "replay"}
          >
            {/* Internal controllers remain mounted for replay state restoration. */}
            <div hidden inert>
              <div className="replay-context">
                <div className="replay-period">
                  <span id="rangeLabel">—</span>
                  <span className="muted">New York · ET</span>
                </div>
                <div className="replay-result">
                  <span>{translate("Результат сессии")}</span>
                  <strong id="netStat">$0.00</strong>
                </div>
              </div>
              <div
                className="orderflow-controls"
                aria-label="Order flow controls"
              >
                <label>
                  Chart{" "}
                  <select id="chartDisplay" defaultValue="candles">
                    <option value="candles">Candles</option>
                    <option value="footprint">Footprint</option>
                  </select>
                </label>
                <label>
                  Source{" "}
                  <select id="orderflowSource" defaultValue="replay">
                    <option value="replay">Replay</option>
                    <option value="demo">Demo</option>
                    <option value="live">Live</option>
                  </select>
                </label>
                <label>
                  Rows{" "}
                  <select id="footprintGrouping" defaultValue="1" hidden>
                    <option value="1">1 tick</option>
                    <option value="2">2 ticks</option>
                    <option value="4">4 ticks</option>
                    <option value="8">8 ticks</option>
                  </select>
                </label>
                <span id="feedStatus" role="status">
                  Replay
                </span>
                <span id="footprintSummary" aria-live="polite" />
                <span id="feedClock" />
                <button id="demoDisconnect" type="button" hidden>
                  Demo disconnect / reconnect
                </button>
                <label id="tradeClockWrap" hidden>
                  Within minute{" "}
                  <input
                    id="tradeClock"
                    type="range"
                    min="0"
                    max="59999"
                    step="1"
                    defaultValue="0"
                  />
                  <output id="tradeClockLabel" />
                </label>
              </div>
            </div>
            <div className="workspace-grid">
              <section className="chart-card" id="chartCard">
                <div className="chart-toolbar">
                  <div hidden inert>
                    <div className="symbol-group">
                      <label className="sr-only" htmlFor="symbol">
                        {translate("Инструмент")}
                      </label>
                      <select id="symbol">
                        <option value="NQ">NQ</option>
                        <option value="ES">ES</option>
                      </select>
                      <span id="contractName">E-mini Nasdaq-100</span>
                      <span className="exchange">CME</span>
                    </div>
                  </div>
                  <div className="chart-tools">
                    <div
                      className="timeframes"
                      role="group"
                      aria-label={translate("Таймфрейм")}
                    >
                      <button
                        data-tf={1}
                        className="selected"
                        aria-pressed="true"
                      >
                        1m
                      </button>
                      <button data-tf={3} aria-pressed="false">
                        3m
                      </button>
                      <button data-tf={5} aria-pressed="false">
                        5m
                      </button>
                      <button data-tf={15} aria-pressed="false">
                        15m
                      </button>
                      <button data-tf={30} aria-pressed="false">
                        30m
                      </button>
                      <button data-tf={60} aria-pressed="false">
                        1h
                      </button>
                    </div>
                    <div className="drawing-status" aria-live="polite">
                      <span id="drawingHint">
                        {translate("Перемещение и масштаб")}
                      </span>
                      <span
                        className="drawing-count"
                        id="drawingCount"
                        aria-label={translate("Количество объектов")}
                      >
                        0
                      </span>
                    </div>
                    <button
                      id="compareToggle"
                      className="icon-button compare-button"
                      type="button"
                      aria-pressed="false"
                      aria-label={translate("Два графика")}
                      title={translate("Два графика")}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <rect x="3" y="5" width="18" height="14" rx="3" />
                        <path className="compare-icon-divider" d="M12 5v14" />
                      </svg>
                    </button>
                    <button
                      id="settingsOpen"
                      className="settings-button"
                      aria-label={translate("Настройки графика")}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <path d="M4 7h16M4 17h16M8 3v8M16 13v8" />
                      </svg>
                      <span>{translate("Настройки")}</span>
                    </button>
                  </div>
                </div>
                <div className="chart-panes" id="chartPanes">
                  <section className="chart-pane primary-pane">
                    <div className="chart-legend">
                      <button
                        type="button"
                        className="chart-pane-symbol pane-instrument-trigger"
                        id="primaryChartTitle"
                      >
                        NQ · 1m
                      </button>
                      <span id="statusTitle" />
                      <span
                        id="marketOpenStatus"
                        className="status-market-dot"
                        role="img"
                      />
                      <strong id="lastPrice">—</strong>
                      <span id="ohlc" className="mono">
                        O — H — L — C —
                      </span>
                      <span id="barChange" className="mono" />
                      <span id="statusVolume" className="mono" hidden />
                      <span className="chart-status" id="chartStatus">
                        {translate("ПАУЗА")}
                      </span>
                    </div>
                    <div className="chart-container" id="chart">
                      <div id="chartError" hidden>
                        {translate(
                          "Не удалось загрузить график. Обновите страницу.",
                        )}
                      </div>
                    </div>
                    <p className="pane-notice muted" id="mainChartNotice">
                      {translate("Заявки по NQ")}
                    </p>
                  </section>
                </div>
                <div className="replay-panel">
                  <div className="replay-controls">
                    <div
                      className="replay-transport"
                      role="group"
                      aria-label="Playback controls"
                    >
                      <button
                        id="play"
                        className="play-button"
                        aria-label={translate("Воспроизвести")}
                      >
                        <span id="playIcon">▶</span>
                        <span id="playLabel">Replay</span>
                      </button>
                      <button
                        id="step"
                        className="icon-button step-button"
                        aria-label={translate("Следующая свеча")}
                        title={translate("Следующая свеча — клавиша вправо")}
                      >
                        ▸│
                      </button>
                      <button
                        id="sessionSkip"
                        type="button"
                        className="icon-button"
                        aria-label={translate("Перейти к открытию сессии")}
                        title={translate("Перейти к открытию сессии")}
                        aria-haspopup="menu"
                        aria-expanded="false"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path
                            d="m4 6 7 6-7 6V6Zm8 0 7 6-7 6V6ZM21 5v14"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>{translate("К открытию")}</span>
                      </button>
                      <select
                        id="speed"
                        aria-label={translate("Скорость воспроизведения")}
                      >
                        <option value={1000}>1×</option>
                        <option value={500}>2×</option>
                        <option value={250}>4×</option>
                      </select>
                    </div>
                    <div
                      className="quick-order"
                      role="group"
                      aria-label={translate("Быстрая сделка")}
                    >
                      <div className="quick-order-instrument">
                        <strong id="orderInstrument">NQ</strong>
                        <small id="quickOrderType">Market</small>
                      </div>
                      <div className="order-fields">
                        <label htmlFor="qty">
                          {translate("Контракты")}
                          <span id="tickInfo">
                            {translate("1 тик = $5.00")}
                          </span>
                        </label>
                        <div className="stepper">
                          <button
                            id="qtyDown"
                            aria-label={translate("Меньше контрактов")}
                          >
                            −
                          </button>
                          <input
                            id="qty"
                            type="number"
                            min={1}
                            max={100}
                            step={1}
                            defaultValue={1}
                          />
                          <button
                            id="qtyUp"
                            aria-label={translate("Больше контрактов")}
                          >
                            +
                          </button>
                        </div>
                        <div className="field-pair">
                          <div>
                            <label htmlFor="stop">
                              {translate("Стоп, пт")}
                            </label>
                            <input
                              id="stop"
                              type="number"
                              min="0.25"
                              step="0.25"
                              defaultValue={12}
                            />
                          </div>
                          <div>
                            <label htmlFor="target">
                              {translate("Тейк, пт")}
                            </label>
                            <input
                              id="target"
                              type="number"
                              min="0.25"
                              step="0.25"
                              defaultValue={24}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="trade-buttons">
                        <button id="long" className="trade long">
                          Long <span>{translate("Купить")}</span>
                        </button>
                        <button id="short" className="trade short">
                          Short <span>{translate("Продать")}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        id="quickOrderSettings"
                        className="icon-button"
                        popoverTarget="orderTicket"
                        aria-haspopup="dialog"
                        aria-label={translate("Параметры сделки")}
                        title={translate("Параметры сделки")}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path d="M4 7h16M4 17h16M8 3v8M16 13v8" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="replay-time">
                    <strong id="replayTime" className="mono">
                      —
                    </strong>
                    <span id="progressLabel">{translate("Свеча 1 из —")}</span>
                  </div>
                </div>
                <div className="quick-position" id="quickPosition" hidden>
                  <strong id="quickPositionText" />
                  <span id="quickPositionPnl" className="mono" />
                  <button
                    type="button"
                    className="text-button"
                    popoverTarget="orderTicket"
                  >
                    {translate("Управление позицией")}
                  </button>
                  <button
                    type="button"
                    id="quickClose"
                    className="button secondary compact"
                  >
                    {translate("Закрыть всё")}
                  </button>
                </div>
                <div className="progress-track">
                  <div id="progressBar" />
                </div>
              </section>
              <aside
                className="order-card"
                id="orderTicket"
                popover="auto"
                role="dialog"
                aria-labelledby="orderTicketTitle"
              >
                <div className="panel-title">
                  <h2 id="orderTicketTitle">{translate("Параметры сделки")}</h2>
                  <span className="market-label" id="orderTypeBadge">
                    MARKET
                  </span>
                  <button
                    className="ticket-close icon-button"
                    type="button"
                    popoverTarget="orderTicket"
                    popoverTargetAction="hide"
                    aria-label={translate("Закрыть панель сделки")}
                  >
                    ×
                  </button>
                </div>
                <p className="entry-note" id="orderHint">
                  {translate(
                    "Market исполняется по текущей цене с учётом издержек",
                  )}
                </p>
                <label htmlFor="orderKind">{translate("Тип заявки")}</label>
                <select id="orderKind" className="full">
                  <option value="market">
                    {translate("Market · по рынку")}
                  </option>
                  <option value="limit">{translate("Limit · лимитная")}</option>
                  <option value="stop">
                    {translate("Stop · пробой уровня")}
                  </option>
                </select>
                <div id="entryPriceWrap" className="entry-price-field" hidden>
                  <label htmlFor="entryPrice">{translate("Цена входа")}</label>
                  <input
                    id="entryPrice"
                    type="number"
                    min="0.25"
                    step="0.25"
                    inputMode="decimal"
                    placeholder={translate("Цена заявки")}
                  />
                </div>
                <details className="risk-sizing">
                  <summary>{translate("Рассчитать объём по риску")}</summary>
                  <label htmlFor="riskBudget">
                    {translate("Бюджет риска, $")}
                  </label>
                  <div className="risk-sizing-row">
                    <input
                      id="riskBudget"
                      type="number"
                      min={1}
                      max={1000000}
                      step={25}
                      defaultValue={250}
                      inputMode="decimal"
                    />
                    <button
                      id="sizeByRisk"
                      type="button"
                      className="button secondary compact"
                      title={translate(
                        "Подобрать число контрактов по бюджету риска",
                      )}
                    >
                      {translate("Рассчитать")}
                    </button>
                  </div>
                </details>
                <div className="risk-summary">
                  <div>
                    <span>{translate("Риск сделки ≈")}</span>
                    <strong id="riskValue">$250.00</strong>
                  </div>
                  <div>
                    <span>{translate("Соотношение R:R")}</span>
                    <strong id="rrValue">1 : 2.0</strong>
                  </div>
                </div>
                <details className="costs">
                  <summary>{translate("Комиссия и проскальзывание")}</summary>
                  <label htmlFor="fee">
                    {translate("Комиссия, $ / сторона / контракт")}
                  </label>
                  <input
                    type="number"
                    id="fee"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue="2.50"
                  />
                  <label htmlFor="slip">
                    {translate("Проскальзывание, тики")}
                  </label>
                  <input
                    type="number"
                    id="slip"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={1}
                  />
                  <p>
                    {translate(
                      "Пример издержек. Укажите условия своего брокера.",
                    )}
                  </p>
                </details>
                <div className="position-box" id="positionBox" />
                <p className="order-footnote">
                  {translate(
                    "Учебная симуляция. Реальные ордера не отправляются.",
                  )}
                </p>
              </aside>
            </div>
          </section>
          <section
            id="view-sessions"
            className="app-view"
            data-app-view="sessions"
            hidden={currentView !== "sessions"}
          >
            <div className="view-heading workspace-page-actions">
              <div className="heading-actions">
                <Link
                  href="/strategies"
                  scroll={false}
                  className="button secondary"
                  data-view="playbooks"
                >
                  {translate("Стратегии")}
                </Link>
                <button id="setupOpen" className="button primary" type="button">
                  {translate("＋ Новая сессия")}
                </button>
              </div>
            </div>
            <div id="sessionsContent" className="view-content">
              <p className="muted" role="status">
                {translate("Загружаем сессии…")}
              </p>
            </div>
          </section>
          <section
            id="view-journal"
            className="app-view"
            data-app-view="journal"
            hidden={currentView !== "journal"}
          >
            <div
              className="journal-source-tabs"
              role="group"
              aria-label="Journal source"
            >
              <button
                type="button"
                className={`button secondary compact${journalSource === "replay" ? " active" : ""}`}
                aria-pressed={journalSource === "replay"}
                onClick={() => setJournalSource("replay")}
              >
                Replay
              </button>
              <button
                type="button"
                className={`button secondary compact${journalSource === "mt5" ? " active" : ""}`}
                aria-pressed={journalSource === "mt5"}
                onClick={() => setJournalSource("mt5")}
              >
                MT5
              </button>
            </div>
            <div hidden={journalSource !== "replay"}>
              <div id="journalFilters" className="journal-filters" />
              <div id="journalSummary" className="journal-summary" />
              <section className="journal-card">
                <div className="journal-header">
                  <div>
                    <h2>
                      {translate("Журнал сделок")}
                      <span id="tradeCount">0</span>
                    </h2>
                    <p>
                      {translate(
                        "Закрытые сделки, сетапы и заметки в одном месте.",
                      )}
                    </p>
                  </div>
                  <button
                    className="button secondary compact"
                    id="export"
                    disabled
                  >
                    {translate("Экспорт CSV")}
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {translate("Инструмент / вход")}
                          <span id="journalZone">ET</span>
                        </th>
                        <th>{translate("Сторона")}</th>
                        <th>{translate("Объём")}</th>
                        <th>{translate("Вход")}</th>
                        <th>{translate("Выход")}</th>
                        <th>{translate("Результат")}</th>
                        <th>R</th>
                        <th>{translate("Стратегия / закрытие")}</th>
                      </tr>
                    </thead>
                    <tbody id="tradeRows" />
                  </table>
                  <div id="emptyJournal" className="empty-journal">
                    <span className="empty-icon">≡</span>
                    <div>
                      <strong>{translate("Здесь появятся ваши сделки")}</strong>
                      <p>
                        {translate(
                          "Завершите сделку в replay. Она сохранится вместе с вашей сессией.",
                        )}
                      </p>
                    </div>
                    <span className="empty-hint">
                      01 <span>/</span> {translate("Найдите свой сетап")}
                    </span>
                  </div>
                </div>
              </section>
            </div>
            <Mt5Journal
              active={currentView === "journal" && journalSource === "mt5"}
            />
          </section>
          <section
            id="view-analytics"
            className="app-view"
            data-app-view="analytics"
            hidden={currentView !== "analytics"}
          >
            <div id="analyticsContent" className="view-content" />
          </section>
          <section
            id="view-playbooks"
            className="app-view"
            data-app-view="playbooks"
            hidden={currentView !== "playbooks"}
          >
            <div id="playbooksContent" className="view-content" />
          </section>
        </main>
      </div>
      <dialog id="setupDialog">
        <form id="setupForm">
          <div className="dialog-header">
            <div>
              <p className="eyebrow">REPLAY SESSION</p>
              <h2>{translate("Новая сессия")}</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              data-close="setupDialog"
              aria-label={translate("Закрыть")}
            >
              ×
            </button>
          </div>
          <label htmlFor="sessionName">{translate("Название сессии")}</label>
          <input
            id="sessionName"
            className="full"
            type="text"
            maxLength={100}
            required
            placeholder={translate("Введите название сессии")}
          />
          <div className="field-pair session-setup-fields">
            <div>
              <label htmlFor="sessionCapital">
                {translate("Начальный капитал, $")}
              </label>
              <select id="sessionCapital" defaultValue="50000" required>
                {ACCOUNT_DEPOSITS.map((amount) => (
                  <option key={amount} value={amount}>
                    ${amount.toLocaleString("en-US")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sessionStrategy">{translate("Стратегия")}</label>
              <select id="sessionStrategy" className="full">
                <option value="">{translate("Без стратегии")}</option>
              </select>
            </div>
          </div>
          <fieldset className="session-instruments">
            <legend>{translate("Инструменты")}</legend>
            <label className="session-instrument" htmlFor="sessionNQ">
              <input
                id="sessionNQ"
                type="checkbox"
                defaultValue="NQ"
                defaultChecked
              />
              <span>
                <strong>NQ</strong>
                <small>E-mini Nasdaq-100</small>
              </span>
            </label>
            <label className="session-instrument" htmlFor="sessionES">
              <input
                id="sessionES"
                type="checkbox"
                defaultValue="ES"
                defaultChecked
              />
              <span>
                <strong>ES</strong>
                <small>E-mini S&amp;P 500</small>
              </span>
            </label>
          </fieldset>
          <p className="dialog-intro">
            {translate(
              "Выберите даты. Для NQ + ES оба графика идут по одному времени replay.",
            )}
          </p>
          <div className="card-actions" id="setupYears">
            <button
              type="button"
              className="button secondary compact"
              data-setup-year={2024}
            >
              2024
            </button>
            <button
              type="button"
              className="button secondary compact"
              data-setup-year={2025}
            >
              2025
            </button>
            <button
              type="button"
              className="button secondary compact"
              data-setup-year={2026}
            >
              2026
            </button>
          </div>
          <div className="field-pair">
            <div>
              <label htmlFor="fromDate">{translate("Начало, ET")}</label>
              <input id="fromDate" type="date" required />
            </div>
            <div>
              <label htmlFor="toDate">
                {translate("Конец, ET · включительно")}
              </label>
              <input id="toDate" type="date" required />
            </div>
          </div>
          <div id="setupError" className="form-error" role="alert" />
          <button className="button primary full" type="submit">
            {translate("Начать сессию")}
          </button>
        </form>
      </dialog>
      <dialog id="importDialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">YOUR MARKET DATA</p>
            <h2>{translate("Загрузить историю")}</h2>
          </div>
          <button
            className="icon-button"
            data-close="importDialog"
            aria-label={translate("Закрыть")}
          >
            ×
          </button>
        </div>
        <p className="dialog-intro">
          {translate(
            "Минутные свечи для одного фьючерса. Файл обрабатывается в браузере.",
          )}
        </p>
        <label htmlFor="importSymbol">{translate("Инструмент файла")}</label>
        <select id="importSymbol">
          <option value="NQ">NQ · E-mini Nasdaq-100</option>
          <option value="ES">ES · E-mini S&amp;P 500</option>
        </select>
        <label htmlFor="csvFormat">{translate("Формат времени")}</label>
        <select id="csvFormat">
          <option value="standard">
            {translate("Стандартный CSV / Databento · Unix или ISO с поясом")}
          </option>
          <option value="firstrate">
            {translate("FirstRate · без заголовка, время по Нью-Йорку")}
          </option>
        </select>
        <label className="upload-zone" htmlFor="csvFile">
          <span className="upload-symbol">↥</span>
          <strong>{translate("Выбрать CSV")}</strong>
          <span>
            {translate("До 250 МБ · до 3 млн свечей · сохранение по месяцам")}
          </span>
          <input
            id="csvFile"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
          />
        </label>
        <p className="format-label">{translate("Формат данных")}</p>
        <pre>
          time,open,high,low,close,volume{"\n"}
          2026-09-21T09:30:00-04:00,21480,21482,21478,21481,530
        </pre>
        <p className="muted dialog-note">
          {translate(
            "time — время открытия: Unix (секунды / миллисекунды) или ISO с часовым поясом. Также принимается ts_event вместо time (включая наносекунды). volume и contract необязательны. Для ролловера добавьте contract (например NQH24 / NQM24); без него смену контракта определить нельзя. Цены кратны 0.25. Даты на сайте — по Нью-Йорку. Используйте один контракт или корректно подготовленную непрерывную серию. Для Databento выбирайте CSV с ценами в пунктах, не в целочисленных единицах 1e-9.",
          )}
        </p>
        <button className="text-button" id="sample">
          {translate("Скачать шаблон CSV · синтетический")}
        </button>
        <div id="importError" className="form-error" role="alert" />
        <p className="muted dialog-note">
          {translate(
            "Текущая сессия сохранится. Импорт обновит историю выбранного инструмента.",
          )}
        </p>
      </dialog>
      <dialog id="sourceDialog">
        <div className="dialog-header">
          <h2>{translate("Источник данных")}</h2>
          <button
            className="icon-button"
            data-close="sourceDialog"
            aria-label={translate("Закрыть")}
          >
            ×
          </button>
        </div>
        <p className="eyebrow" id="sourceName" />
        <p className="dialog-intro" id="sourceRange" />
        <div id="providerNotes">
          <p className="dialog-note">
            {translate(
              "Настоящие минутные OHLCV: FirstRate Data via HF Market Data. Встроенное покрытие — 2–31 января 2024. Поставщик HF Market Data сейчас отключён. Этот ранее сохранённый архив доступен; новые даты добавляются через CSV.",
            )}
          </p>
          <p className="dialog-note">
            {translate(
              "Непрерывная серия: основной контракт, ролловер по объёму, все сессии, без корректировки цены (adjust: none). Код фактического контракта сохранён для каждой свечи. Цены и объёмы не изменялись; пропуски не заполнялись.",
            )}
          </p>
          <p className="dialog-note muted" id="sourceContracts" />
          <div className="contract-specs">
            <a
              id="sourceLink"
              href="https://www.hfmarketdata.io/docs"
              target="_blank"
              rel="noopener"
            >
              {translate("HF Market Data · документация источника")}
            </a>
            <a
              href="https://www.hfmarketdata.io/data-license"
              target="_blank"
              rel="noopener"
            >
              {translate("Лицензия данных и атрибуция")}
            </a>
          </div>
          <p className="dialog-note muted">
            {translate(
              "Market data: FirstRate Data via HF Market Data (hfmarketdata.io). © FirstRate Data. Для вашего личного использования в приватном сайте.",
            )}
          </p>
        </div>
        <div id="curatedSourceNotes" hidden>
          <p id="curatedSourceSummary" className="dialog-note" />
          <p id="curatedSourceDetails" className="dialog-note muted" />
          <a
            id="curatedSourceLink"
            className="text-button"
            target="_blank"
            rel="noopener"
          >
            {translate("Оригинальный источник данных ↗")}
          </a>
        </div>
        <p id="userSourceNote" className="dialog-note" hidden>
          {translate(
            "Данные из загруженного вами CSV. Источник и качество этого файла не проверялись у поставщика.",
          )}
        </p>
      </dialog>
      <button id="importOpen" type="button" hidden>
        {translate("Импорт CSV")}
      </button>
      <dialog id="settingsDialog" className="tv-settings" />
      <dialog id="tradeDetailDialog" className="trade-detail-dialog" />
      <div
        id="toast"
        className="toast"
        role="status"
        aria-live="polite"
        hidden
      />
      <noscript>{translate("Для replay включите JavaScript.")}</noscript>
    </>
  );
}
