"use client";
import { useEffect } from "react";
import { AccountMenu } from "./auth-boundary";

// The replay terminal owns its chart DOM. Load it only after React mounts the page.
export function ReplayWorkspace() {
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
      <aside className="app-sidebar">
        <a className="brand" href="./" aria-label="Replay Lab">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m8 5 11 7-11 7V5Z" />
            </svg>
          </span>
          <span>
            replay<span className="brand-light">lab</span>
            <small>TRADING WORKSPACE</small>
          </span>
        </a>
        <div className="sidebar-caption">РАБОЧАЯ ОБЛАСТЬ</div>
        <nav className="app-nav" aria-label="Основная навигация">
          <button
            type="button"
            className="nav-item"
            data-view="replay"
            aria-label="Replay"
            aria-current="false"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 10 7-10 7V5Z" />
              <path d="M4 5v14" />
            </svg>
            <span>Replay</span>
            <span className="nav-live-dot" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nav-item active"
            data-view="sessions"
            aria-label="Сессии"
            aria-current="page"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x={4} y={5} width={16} height={15} rx={2} />
              <path d="M8 3v4M16 3v4M4 11h16M8 15h3M14 15h2" />
            </svg>
            <span>Сессии</span>
          </button>
          <button
            type="button"
            className="nav-item "
            data-view="journal"
            aria-label="Журнал"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 8h7M8 12h7M8 16h4" />
            </svg>
            <span>Журнал</span>
          </button>
          <button
            type="button"
            className="nav-item "
            data-view="analytics"
            aria-label="Аналитика"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20V5M4 20h17M8 16v-4M13 16V8M18 16V3" />
            </svg>
            <span>Аналитика</span>
          </button>
          <button
            type="button"
            className="nav-item"
            data-view="data"
            aria-label="Данные"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
            </svg>
            <span>Данные</span>
          </button>
        </nav>
      </aside>
      <div className="app-shell">
        <header className="topbar product-topbar">
          <div className="top-actions">
            <AccountMenu />
            <span id="saveStatus" className="save-status" role="status">
              <span className="status-dot" />
              Сохранено локально
            </span>
            <button
              type="button"
              className="icon-button theme-toggle"
              id="themeToggle"
              aria-label="Переключить тему"
              aria-pressed="true"
              title="Включить светлую тему"
            >
              <span aria-hidden="true">☀</span>
            </button>
          </div>
        </header>
        <main className="product-main">
          <section
            id="view-replay"
            className="app-view"
            data-app-view="replay"
            hidden
          >
            <div className="replay-context">
              <div className="replay-period">
                <span id="rangeLabel">—</span>
                <span className="muted">New York · ET</span>
              </div>
              <div className="replay-result">
                <span>Результат сессии</span>
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
            <div className="workspace-grid">
              <section className="chart-card" id="chartCard">
                <div className="chart-toolbar">
                  <div className="symbol-group">
                    <label className="sr-only" htmlFor="symbol">
                      Инструмент
                    </label>
                    <select id="symbol">
                      <option value="NQ">NQ</option>
                      <option value="ES">ES</option>
                    </select>
                    <span id="contractName">E-mini Nasdaq-100</span>
                    <span className="exchange">CME</span>
                  </div>
                  <div className="chart-tools">
                    <div
                      className="timeframes"
                      role="group"
                      aria-label="Таймфрейм"
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
                    <button
                      id="compareToggle"
                      className="settings-button compare-button"
                      aria-pressed="false"
                      aria-label="Показать NQ и ES рядом"
                      title="Показать NQ и ES рядом"
                    >
                      ▥ <span>Два графика</span>
                    </button>
                    <button
                      id="chartExpand"
                      className="icon-button"
                      type="button"
                      aria-pressed="false"
                      aria-label="Развернуть графики"
                      title="Развернуть графики"
                    >
                      ⤢
                    </button>
                    <button
                      id="settingsOpen"
                      className="settings-button"
                      aria-label="Настройки графика"
                    >
                      ⚙ <span>Настройки</span>
                    </button>
                    <button
                      id="fit"
                      className="icon-button"
                      title="Показать все открытые свечи"
                      aria-label="Масштаб по всем свечам"
                    >
                      ⛶
                    </button>
                  </div>
                </div>
                <div
                  className="drawing-toolbar"
                  role="group"
                  aria-label="Разметка графика"
                >
                  <button
                    data-draw="cursor"
                    className="selected"
                    aria-pressed="true"
                    title="Перемещение и масштаб"
                  >
                    ↖ <span>Курсор</span>
                  </button>
                  <button
                    data-draw="select"
                    aria-pressed="false"
                    title="Выбрать и переместить объект"
                  >
                    ⌖ <span>Изменить</span>
                  </button>
                  <button
                    data-draw="level"
                    aria-pressed="false"
                    title="Горизонтальный уровень"
                  >
                    ─ <span>Уровень</span>
                  </button>
                  <button
                    data-draw="ray"
                    aria-pressed="false"
                    title="Горизонтальный луч"
                  >
                    ⇢ <span>Луч</span>
                  </button>
                  <button
                    data-draw="trend"
                    aria-pressed="false"
                    title="Трендовая линия"
                  >
                    ╱ <span>Линия</span>
                  </button>
                  <button
                    data-draw="zone"
                    aria-pressed="false"
                    title="Прямоугольная зона"
                  >
                    ▭ <span>Зона</span>
                  </button>
                  <span className="drawing-divider" />
                  <button
                    id="drawUndo"
                    title="Удалить последний видимый объект"
                    aria-label="Отменить последнее рисование"
                  >
                    ↶
                  </button>
                  <button
                    id="drawDelete"
                    title="Удалить выбранный объект"
                    aria-label="Удалить выбранный объект"
                  >
                    ⌫
                  </button>
                  <button
                    id="drawClear"
                    title="Удалить всю разметку"
                    aria-label="Удалить всю разметку"
                  >
                    ×
                  </button>
                  <span className="drawing-count" id="drawingCount">
                    0
                  </span>
                </div>
                <div className="drawing-hint" id="drawingHint">
                  Перемещение и масштаб · разметка сохраняется
                </div>
                <div className="chart-panes" id="chartPanes">
                  <section className="chart-pane primary-pane">
                    <div className="chart-legend">
                      <strong
                        className="chart-pane-symbol"
                        id="primaryChartTitle"
                      >
                        NQ · 1m
                      </strong>
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
                        ПАУЗА
                      </span>
                    </div>
                    <div className="chart-container" id="chart">
                      <div id="chartError" hidden>
                        Не удалось загрузить график. Обновите страницу.
                      </div>
                    </div>
                    <p className="pane-notice muted" id="mainChartNotice">
                      Заявки по NQ
                    </p>
                  </section>
                </div>
                <div className="replay-panel">
                  <div className="replay-controls">
                    <button
                      id="reset"
                      className="icon-button"
                      aria-label="Начать сессию заново"
                      title="Начать заново"
                    >
                      ↺
                    </button>
                    <button
                      id="play"
                      className="play-button"
                      aria-label="Воспроизвести"
                    >
                      <span id="playIcon">▶</span>
                      <span id="playLabel">Replay</span>
                    </button>
                    <button
                      id="step"
                      className="icon-button step-button"
                      aria-label="Следующая свеча"
                      title="Следующая свеча — клавиша вправо"
                    >
                      ▸│
                    </button>
                    <select id="speed" aria-label="Скорость воспроизведения">
                      <option value={1000}>1×</option>
                      <option value={500}>2×</option>
                      <option value={250}>4×</option>
                    </select>
                  </div>
                  <div className="replay-time">
                    <strong id="replayTime" className="mono">
                      —
                    </strong>
                    <span id="progressLabel">Свеча 1 из —</span>
                  </div>
                </div>
                <div className="progress-track">
                  <div id="progressBar" />
                </div>
                <div className="chart-footer">
                  <span>
                    Пробел — пауза{" "}
                    <span className="kbd-gap">→ — следующая свеча</span>
                  </span>
                  <span id="baseInterval">Шаг: 1 мин · ET</span>
                </div>
              </section>
              <aside className="order-card">
                <div className="panel-title">
                  <h2>Новая сделка</h2>
                  <span className="market-label" id="orderTypeBadge">
                    MARKET
                  </span>
                </div>
                <p className="entry-note" id="orderHint">
                  Вход на открытии следующей свечи
                </p>
                <label htmlFor="orderKind">Тип заявки</label>
                <select id="orderKind" className="full">
                  <option value="market">Market · по рынку</option>
                  <option value="limit">Limit · лимитная</option>
                  <option value="stop">Stop · пробой уровня</option>
                </select>
                <div id="entryPriceWrap" className="entry-price-field" hidden>
                  <label htmlFor="entryPrice">Цена входа</label>
                  <input
                    id="entryPrice"
                    type="number"
                    min="0.25"
                    step="0.25"
                    inputMode="decimal"
                    placeholder="Цена заявки"
                  />
                </div>
                <div className="order-fields">
                  <label htmlFor="qty">
                    Контракты <span id="tickInfo">1 тик = $5.00</span>
                  </label>
                  <div className="stepper">
                    <button id="qtyDown" aria-label="Меньше контрактов">
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
                    <button id="qtyUp" aria-label="Больше контрактов">
                      +
                    </button>
                  </div>
                  <div className="field-pair">
                    <div>
                      <label htmlFor="stop">Стоп, пт</label>
                      <input
                        id="stop"
                        type="number"
                        min="0.25"
                        step="0.25"
                        defaultValue={12}
                      />
                    </div>
                    <div>
                      <label htmlFor="target">Тейк, пт</label>
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
                <details className="risk-sizing">
                  <summary>Рассчитать объём по риску</summary>
                  <label htmlFor="riskBudget">Бюджет риска, $</label>
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
                      title="Подобрать число контрактов по бюджету риска"
                    >
                      Рассчитать
                    </button>
                  </div>
                </details>
                <div className="risk-summary">
                  <div>
                    <span>Риск сделки ≈</span>
                    <strong id="riskValue">$250.00</strong>
                  </div>
                  <div>
                    <span>Соотношение R:R</span>
                    <strong id="rrValue">1 : 2.0</strong>
                  </div>
                </div>
                <div className="trade-buttons">
                  <button id="long" className="trade long">
                    Long <span>Купить</span>
                  </button>
                  <button id="short" className="trade short">
                    Short <span>Продать</span>
                  </button>
                </div>
                <details className="costs">
                  <summary>Комиссия и проскальзывание</summary>
                  <label htmlFor="fee">Комиссия, $ / сторона / контракт</label>
                  <input
                    type="number"
                    id="fee"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue="2.50"
                  />
                  <label htmlFor="slip">Проскальзывание, тики</label>
                  <input
                    type="number"
                    id="slip"
                    min={0}
                    max={100}
                    step={1}
                    defaultValue={1}
                  />
                  <p>Пример издержек. Укажите условия своего брокера.</p>
                </details>
                <div className="position-box" id="positionBox" />
                <p className="order-footnote">
                  Учебная симуляция. Реальные ордера не отправляются.
                </p>
              </aside>
            </div>
            <details className="replay-notes">
              <summary>Заметки к сессии</summary>
              <label className="sr-only" htmlFor="sessionNotes">
                Заметки к текущей сессии
              </label>
              <textarea
                id="sessionNotes"
                rows={2}
                placeholder="Что ищете на графике? Какой сценарий отменит вход?"
                defaultValue={""}
              />
            </details>
          </section>
          <section
            id="view-sessions"
            className="app-view"
            data-app-view="sessions"
          >
            <div className="view-heading">
              <div>
                <h1>Сессии</h1>
              </div>
              <div className="heading-actions">
                <button
                  type="button"
                  className="button secondary"
                  data-view="playbooks"
                >
                  Стратегии
                </button>
                <button id="setupOpen" className="button primary" type="button">
                  ＋ Новая сессия
                </button>
              </div>
            </div>
            <div id="sessionsContent" className="view-content">
              <p className="muted" role="status">
                Загружаем сессии…
              </p>
            </div>
          </section>
          <section
            id="view-journal"
            className="app-view"
            data-app-view="journal"
            hidden
          >
            <div className="view-heading">
              <div>
                <p className="eyebrow">TRADE JOURNAL</p>
                <h1>Журнал сделок</h1>
              </div>
            </div>
            <div id="journalFilters" className="journal-filters" />
            <div id="journalSummary" className="journal-summary" />
            <section className="journal-card">
              <div className="journal-header">
                <div>
                  <h2>
                    Журнал сделок <span id="tradeCount">0</span>
                  </h2>
                  <p>Закрытые сделки, сетапы и заметки в одном месте.</p>
                </div>
                <button
                  className="button secondary compact"
                  id="export"
                  disabled
                >
                  Экспорт CSV
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>
                        Инструмент / вход <span id="journalZone">ET</span>
                      </th>
                      <th>Сторона</th>
                      <th>Объём</th>
                      <th>Вход</th>
                      <th>Выход</th>
                      <th>Результат</th>
                      <th>R</th>
                      <th>Стратегия / закрытие</th>
                    </tr>
                  </thead>
                  <tbody id="tradeRows" />
                </table>
                <div id="emptyJournal" className="empty-journal">
                  <span className="empty-icon">≡</span>
                  <div>
                    <strong>Здесь появятся ваши сделки</strong>
                    <p>
                      Завершите сделку в replay. Она сохранится вместе с вашей
                      сессией.
                    </p>
                  </div>
                  <span className="empty-hint">
                    01 <span>/</span> Найдите свой сетап
                  </span>
                </div>
              </div>
            </section>
          </section>
          <section
            id="view-analytics"
            className="app-view"
            data-app-view="analytics"
            hidden
          >
            <div className="view-heading">
              <div>
                <p className="eyebrow">PERFORMANCE</p>
                <h1>Аналитика торговли</h1>
                <p className="heading-description">
                  Результаты, риски и закономерности по вашим закрытым сделкам.
                </p>
              </div>
            </div>
            <div id="analyticsContent" className="view-content" />
          </section>
          <section
            id="view-playbooks"
            className="app-view"
            data-app-view="playbooks"
            hidden
          >
            <div className="view-heading">
              <div>
                <p className="eyebrow">YOUR EDGE</p>
                <h1>Мои стратегии</h1>
                <p className="heading-description">
                  Правила сетапов и дисциплина исполнения.
                </p>
              </div>
            </div>
            <div id="playbooksContent" className="view-content" />
          </section>
          <section
            id="view-data"
            className="app-view"
            data-app-view="data"
            hidden
          >
            <div className="view-heading">
              <div>
                <p className="eyebrow">MARKET DATA</p>
                <h1>Исторические данные</h1>
                <p className="heading-description">
                  Покрытие архива, источники и импорт данных для replay.
                </p>
              </div>
              <div className="heading-actions">
                <button
                  id="historyOpen"
                  className="button secondary"
                  type="button"
                >
                  О данных
                </button>
                <button
                  id="importOpen"
                  className="button primary"
                  type="button"
                >
                  Импорт CSV
                </button>
              </div>
            </div>
            <details className="source-details">
              <summary>Источник текущей сессии</summary>
              <button
                id="dataBadge"
                className="demo-badge real"
                aria-label="Источник исторических данных"
              >
                Исторические данные
              </button>
            </details>
            <details className="trade-import">
              <summary>Import tick trades for Footprint</summary>
              <p>
                CSV: time,contract,price,size,side,id · UTC ISO or integer
                nanoseconds. Side: buy/sell/unknown (or B/A/N). Up to 100,000
                trades / 8 MB. One instrument per file.
              </p>
              <input
                id="tradeCSV"
                type="file"
                accept=".csv,text/csv"
                aria-label="Import trade CSV"
              />
              <span id="tradeImportStatus" role="status" />
            </details>
            <div id="dataContent" className="view-content" />
          </section>
        </main>
        <div className="workspace-utilities">
          <button
            type="button"
            className="workspace-help"
            id="help"
            aria-label="Как работает симулятор"
            title="Справка и горячие клавиши"
          >
            <span aria-hidden="true">?</span>
            <span>Справка</span>
          </button>
          <details className="backup-menu">
            <summary>Резервные копии</summary>
            <button id="backupExport" className="sidebar-action" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" />
              </svg>
              Резервная копия
            </button>
            <button id="backupImport" className="sidebar-action" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 16V4m-5 5 5-5 5 5M5 16v5h14v-5" />
              </svg>
              Восстановить копию
            </button>
          </details>
        </div>
      </div>
      <dialog id="setupDialog">
        <form id="setupForm">
          <div className="dialog-header">
            <div>
              <p className="eyebrow">REPLAY SESSION</p>
              <h2>Новая сессия</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              data-close="setupDialog"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <label htmlFor="sessionName">Название сессии</label>
          <input
            id="sessionName"
            className="full"
            type="text"
            maxLength={100}
            placeholder="Например: NQ + ES · NY reversal"
          />
          <div className="field-pair session-setup-fields">
            <div>
              <label htmlFor="sessionCapital">Начальный капитал, $</label>
              <input
                id="sessionCapital"
                type="number"
                min={100}
                max={1000000000}
                step="any"
                defaultValue={50000}
                required
              />
            </div>
            <div>
              <label htmlFor="sessionStrategy">Стратегия</label>
              <select id="sessionStrategy" className="full">
                <option value="">Без стратегии</option>
              </select>
            </div>
          </div>
          <fieldset className="session-instruments">
            <legend>Инструменты</legend>
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
            Выберите даты. Для NQ + ES оба графика идут по одному времени
            replay.
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
              <label htmlFor="fromDate">Начало, ET</label>
              <input id="fromDate" type="date" required />
            </div>
            <div>
              <label htmlFor="toDate">Конец, ET · включительно</label>
              <input id="toDate" type="date" required />
            </div>
          </div>
          <div
            className="range-preview"
            id="rangePreview"
            role="status"
            aria-live="polite"
          />
          <p className="muted dialog-note" id="availableRange" />
          <p className="muted dialog-note">
            Текущая сессия сохранится. Свечи нового периода будут открываться по
            мере replay.
          </p>
          <div id="setupError" className="form-error" role="alert" />
          <button className="button primary full" type="submit">
            Начать сессию
          </button>
        </form>
      </dialog>
      <dialog id="importDialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">YOUR MARKET DATA</p>
            <h2>Загрузить историю</h2>
          </div>
          <button
            className="icon-button"
            data-close="importDialog"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="dialog-intro">
          Минутные свечи для одного фьючерса. Файл обрабатывается в браузере.
        </p>
        <label htmlFor="importSymbol">Инструмент файла</label>
        <select id="importSymbol">
          <option value="NQ">NQ · E-mini Nasdaq-100</option>
          <option value="ES">ES · E-mini S&amp;P 500</option>
        </select>
        <label htmlFor="csvFormat">Формат времени</label>
        <select id="csvFormat">
          <option value="standard">
            Стандартный CSV / Databento · Unix или ISO с поясом
          </option>
          <option value="firstrate">
            FirstRate · без заголовка, время по Нью-Йорку
          </option>
        </select>
        <label className="upload-zone" htmlFor="csvFile">
          <span className="upload-symbol">↥</span>
          <strong>Выбрать CSV</strong>
          <span>До 250 МБ · до 3 млн свечей · сохранение по месяцам</span>
          <input
            id="csvFile"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
          />
        </label>
        <p className="format-label">Формат данных</p>
        <pre>
          time,open,high,low,close,volume{"\n"}
          2026-09-21T09:30:00-04:00,21480,21482,21478,21481,530
        </pre>
        <p className="muted dialog-note">
          time — время открытия: Unix (секунды / миллисекунды) или ISO с часовым
          поясом. Также принимается ts_event вместо time (включая наносекунды).
          volume и contract необязательны. Для ролловера добавьте contract
          (например NQH24 / NQM24); без него смену контракта определить нельзя.
          Цены кратны 0.25. Даты на сайте — по Нью-Йорку. Используйте один
          контракт или корректно подготовленную непрерывную серию. Для Databento
          выбирайте CSV с ценами в пунктах, не в целочисленных единицах 1e-9.
        </p>
        <button className="text-button" id="sample">
          Скачать шаблон CSV · синтетический
        </button>
        <div id="importError" className="form-error" role="alert" />
        <p className="muted dialog-note">
          Текущая сессия сохранится. Импорт обновит историю выбранного
          инструмента.
        </p>
      </dialog>
      <dialog id="helpDialog">
        <div className="dialog-header">
          <h2>Как работает Replay Lab</h2>
          <button
            className="icon-button"
            data-close="helpDialog"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="chart-credit">
          <a href="https://www.tradingview.com/" target="_blank" rel="noopener">
            TradingView Lightweight Charts™
          </a>
        </p>
        <ol className="help-list">
          <li>
            Выберите NQ или ES и диапазон дат. Встроенный архив содержит
            настоящие минутные свечи за январь 2024: 30 118 NQ и 30 107 ES. Для
            других периодов импортируйте архивы CSV; они и сессии сохраняются в
            вашем аккаунте. Нажмите на метку источника, чтобы увидеть точное
            покрытие.
          </li>
          <li>
            Открывайте свечи кнопкой шага или включите replay. Таймфреймы 3m,
            5m, 15m, 30m и 1h строятся только из уже открытых минут. Каждый шаг
            равен одной минутной свече.
          </li>
          <li>
            Выберите Market, Limit или Stop. Market ставит вход на следующее
            доступное открытие, Limit ждёт указанную цену или лучше, Stop
            активируется на следующих свечах. Стоп и тейк отсчитываются от цены
            исполнения. Ручной выход также ждёт следующую свечу.
          </li>
          <li>
            Стоп при гэпе исполняется по открытию, с неблагоприятным
            проскальзыванием. Тейк — по заданной цене. Если задеты оба уровня,
            выбран стоп и поставлена отметка «SL + TP».
          </li>
          <li>
            BE переносит стоп на цену входа; BE + издержки учитывает комиссию и
            заданное проскальзывание выхода. Можно менять SL/TP и закрывать
            позицию по частям. Проскальзывание применяется к рыночным входам и
            выходам и к стопам.
          </li>
          <li>
            В непрерывной серии при смене контракта позиция закрывается по
            последнему доступному close старого контракта с проскальзыванием и
            комиссией. Разница цен между контрактами не считается прибылью.
          </li>
          <li>
            На конце диапазона открытая позиция остаётся открытой.
            Нереализованный P&amp;L показан отдельно и не включён в статистику.
          </li>
        </ol>
        <p className="dialog-note muted">
          Пропуски данных не заполняются. Следующий шаг переходит к следующей
          имеющейся свече. При смене инструмента или периода предыдущая сессия
          сохраняется в архиве. Настройки ⚙ содержат Symbol, Status line, Scales
          and lines и Canvas. Меню по правому клику открывает таблицу свечей,
          список объектов и настройки. Палитра поддерживает прозрачность. Cancel
          отменяет просмотр, Ok сохраняет изменения. Индикаторы доступны в
          разделе Indicators. Уровни и разметка сохраняются в отдельной сессии и
          синхронизируются с аккаунтом. Журнал хранит заметки, теги, правила
          стратегии и изображения; аналитика объединяет закрытые сделки
          сохранённых сессий. При откате replay объекты, созданные позже,
          скрываются. Это Lightweight Charts с дополнительными инструментами;
          Pine Script и полноценный редактор TradingView здесь не подключены.
        </p>
        <div className="contract-specs">
          <a
            href="https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.contractSpecs.html"
            target="_blank"
            rel="noopener"
          >
            NQ · $20 / пункт · тик $5
          </a>
          <a
            href="https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.contractSpecs.html"
            target="_blank"
            rel="noopener"
          >
            ES · $50 / пункт · тик $12.50
          </a>
        </div>
        <p className="license">
          TradingView Lightweight Charts™
          <br />
          <span id="copyright">Copyright © TradingView, Inc.</span>{" "}
          <a href="vendor/LICENSE" target="_blank" rel="noopener">
            Apache 2.0
          </a>{" "}
          ·{" "}
          <a href="vendor/NOTICE" target="_blank" rel="noopener">
            NOTICE
          </a>
        </p>
      </dialog>
      <dialog id="sourceDialog">
        <div className="dialog-header">
          <h2>Источник данных</h2>
          <button
            className="icon-button"
            data-close="sourceDialog"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="eyebrow" id="sourceName" />
        <p className="dialog-intro" id="sourceRange" />
        <div id="providerNotes">
          <p className="dialog-note">
            Настоящие минутные OHLCV: FirstRate Data via HF Market Data.
            Встроенное покрытие — 2–31 января 2024. Поставщик HF Market Data
            сейчас отключён. Этот ранее сохранённый архив доступен; новые даты
            добавляются через CSV.
          </p>
          <p className="dialog-note">
            Непрерывная серия: основной контракт, ролловер по объёму, все
            сессии, без корректировки цены (adjust: none). Код фактического
            контракта сохранён для каждой свечи. Цены и объёмы не изменялись;
            пропуски не заполнялись.
          </p>
          <p className="dialog-note muted" id="sourceContracts" />
          <div className="contract-specs">
            <a
              id="sourceLink"
              href="https://www.hfmarketdata.io/docs"
              target="_blank"
              rel="noopener"
            >
              HF Market Data · документация источника
            </a>
            <a
              href="https://www.hfmarketdata.io/data-license"
              target="_blank"
              rel="noopener"
            >
              Лицензия данных и атрибуция
            </a>
          </div>
          <p className="dialog-note muted">
            Market data: FirstRate Data via HF Market Data (hfmarketdata.io). ©
            FirstRate Data. Для вашего личного использования в приватном сайте.
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
            Оригинальный источник данных ↗
          </a>
        </div>
        <p id="userSourceNote" className="dialog-note" hidden>
          Данные из загруженного вами CSV. Источник и качество этого файла не
          проверялись у поставщика.
        </p>
      </dialog>
      <dialog id="historyDialog">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">2024 / 2025 / 2026 · NQ + ES</p>
            <h2>Реальная история</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            data-close="historyDialog"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="dialog-intro">
          Для теста выберите NQ или ES и диапазон дат в форме «Новая сессия».
          Сайт подберёт исторические данные автоматически. Доступные периоды и
          сведения об источниках показаны в разделе «Данные».
        </p>
        <div className="content-card">
          <strong>Цена и время проверены</strong>
          <p className="dialog-note">
            Проверены порядок времени, шаг цены 0,25, OHLC и повторы. Свечи с
            временем закрытия переведены ко времени открытия минуты. Цены и
            объёмы не изменялись. Корректировку цены, частичное покрытие сессий
            и отсутствие контрактов показываем у соответствующего архива.
          </p>
        </div>
        <p className="dialog-note">
          Полные 2024–2025 и 2026 по текущую дату пока доступны не для каждой
          серии. Наличие месяца означает наличие свечей, а не полный месяц без
          пропусков. HF Market Data отключён 2 октября 2026; сохранённый январь
          2024 продолжает работать.
        </p>
        <div className="contract-specs">
          <a href="https://firstratedata.com/" target="_blank" rel="noopener">
            FirstRate Data · дополнительные архивы ↗
          </a>
          <a href="https://databento.com/" target="_blank" rel="noopener">
            Databento · контрактные данные ↗
          </a>
        </div>
        <p className="dialog-note">
          Свой CSV: до 250 МБ / 3 млн свечей. Платные данные сайт автоматически
          не покупает.
        </p>
        <button type="button" className="button primary full" id="historyData">
          Посмотреть доступные даты
        </button>
        <button
          type="button"
          className="button secondary full"
          id="historyImport"
        >
          Добавить свой CSV
        </button>
      </dialog>
      <dialog id="settingsDialog" className="tv-settings" />
      <dialog id="tradeDetailDialog" className="trade-detail-dialog" />
      <input
        type="file"
        id="backupFile"
        accept=".json,application/json"
        hidden
      />
      <div
        id="toast"
        className="toast"
        role="status"
        aria-live="polite"
        hidden
      />
      <noscript>Для replay включите JavaScript.</noscript>
    </>
  );
}
