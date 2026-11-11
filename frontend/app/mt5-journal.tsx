"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../src/i18n/use-language";

type Account = {
  id: string;
  label: string;
  login: string;
  server: string;
  connected: boolean;
  syncLocation?: "local" | "server";
  workerOnline?: boolean;
  currency: string | null;
  lastSync: string | null;
  job: { status: string; error: string | null } | null;
};
type Annotation = {
  note: string;
  tags: string[];
  strategy: string;
  plannedRisk: number | null;
};
type Trade = {
  id: string;
  symbol: string;
  side: string;
  volume: number;
  entryPrice: number;
  exitPrice: number | null;
  openedAt: number;
  closedAt: number | null;
  profit: number;
  commission: number;
  swap: number;
  fee: number;
  net: number;
  fills: string[];
  annotation: Annotation;
};
type Journal = {
  trades: Trade[];
  total: number;
  currency: string | null;
  warnings: number;
  positions: {
    ticket: string;
    symbol: string;
    side: string;
    volume: number;
    price: number;
    profit: number;
    swap: number;
    sl: number;
    tp: number;
  }[];
  adjustments: {
    ticket: string;
    type: number;
    profit: number;
    commission: number;
    swap: number;
    fee: number;
  }[];
  summary: { net: number; closed: number; wins: number };
};
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const owner = sessionStorage.getItem("replay-user-id");
  if (owner) headers["x-replay-user"] = owner;
  const r = await fetch(`/api/mt5/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.message || "Unable to update the MT5 journal.");
  return data;
}
const statusMessages: Record<string, string> = {
  LOGIN_FAILED:
    "Login failed. Check the account number, server and investor password.",
  READ_ONLY_REQUIRED: "Use the investor password for read-only access.",
  ACCOUNT_MISMATCH: "The terminal returned a different account or server.",
  HISTORY_FAILED: "MT5 could not load account history. Try syncing again.",
  HISTORY_TOO_LARGE:
    "This account exceeds the current import limit of 50,000 deals.",
  SYNC_TIMEOUT: "Sync timed out. Try again when the worker is available.",
  TERMINAL_UNAVAILABLE: "MT5 is unavailable. Check that the terminal is installed and accessible to your connector.",
  CREDENTIALS_UNAVAILABLE: "Reconnect your investor password, then sync again.",
  COLLECTOR_FAILED:
    "The MT5 collector could not finish. Your previous journal is preserved.",
};
export function Mt5Journal({ active }: { active: boolean }) {
  const language = useLanguage();
  const tr = (en: string, ru: string) => (language === "ru" ? ru : en);
  const [state, setState] = useState<{
    configured: boolean;
    workerOnline: boolean;
    accounts: Account[];
  } | null>(null);
  const [id, setId] = useState("");
  const [journal, setJournal] = useState<Journal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [mode, setMode] = useState<"local" | "server">("local");
  const [pairing, setPairing] = useState<{ id: string; token: string } | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  const [trade, setTrade] = useState<Trade | null>(null);
  const [draft, setDraft] = useState<Annotation>({
    note: "",
    tags: [],
    strategy: "",
    plannedRisk: null,
  });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setPairing(null);
  }, [active, id]);
  useEffect(() => {
    if (trade && active && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    if (!active) {
      setTrade(null);
      setForm(false);
    }
  }, [trade, active]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setInterval(() => setTick((x) => x + 1), 5000);
    void (async () => {
      try {
        const next = await api(
          "connections",
          "GET",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setState(next);
        const selected = next.accounts.some((a: Account) => a.id === id)
          ? id
          : next.accounts[0]?.id || "";
        if (selected !== id) {
          setId(selected);
          setJournal(null);
          return;
        }
        if (selected) {
          const data = await api(
            `connections/${selected}/journal?page=${page}&search=${encodeURIComponent(search)}`,
            "GET",
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) setJournal(data);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    })();
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, id, page, search, tick]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setTick((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const account = state?.accounts.find((a) => a.id === id);
  const online = account?.workerOnline ?? state?.workerOnline;
  const money = (n: number) =>
    `${n.toLocaleString(language === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${journal?.currency || account?.currency || ""}`;
  // MT5 history uses broker time. Preserve its clock rather than relabeling it ET.
  const time = (n: number) =>
    new Date(n).toISOString().replace("T", " ").slice(0, 19);
  const running = ["queued", "running"].includes(account?.job?.status || "");
  return (
    <div className="mt5-journal" hidden={!active}>
      <div className="mt5-toolbar">
        <div
          className="mt5-accounts"
          role="group"
          aria-label={tr("MT5 accounts", "Счета MT5")}
        >
          {state?.accounts.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`button secondary compact${a.id === id ? " active" : ""}`}
              aria-pressed={a.id === id}
              onClick={() => {
                setId(a.id);
                setPage(0);
                setJournal(null);
                setTrade(null);
              }}
            >
              {a.label} · {a.login}
            </button>
          ))}
        </div>
        <button
          className="button secondary compact"
          type="button"
          onClick={() => setForm((v) => !v)}
        >
          {tr("Connect MT5", "Подключить MT5")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt5-error">
          {error}
        </p>
      )}
      {state && !state.configured && (
        <p className="mt5-notice">
          {tr(
            "MT5 sync is waiting for server setup. Your replay journal is available in the Replay tab.",
            "Синхронизация MT5 ожидает настройки сервера. Журнал replay доступен на вкладке Replay.",
          )}
        </p>
      )}
      {state?.configured && !online && (
        <p className="mt5-notice">
          {account?.syncLocation === "local"
            ? tr(
                "Your Windows connector is offline. Run it on your trading PC to sync.",
                "Коннектор Windows не в сети. Запустите его на торговом ПК для синхронизации.",
              )
            : tr(
                "MT5 worker is offline. Saved trades remain available.",
                "Сервис MT5 не в сети. Сохранённые сделки доступны.",
              )}
        </p>
      )}
      {form && (
        <form
          className="mt5-connect"
          onSubmit={(e) => {
            e.preventDefault();
            const element = e.currentTarget,
              values = new FormData(element);
            void action(async () => {
              const result = await api("connections", "POST", {
                label: values.get("label"),
                login: values.get("login"),
                server: "FundingPips-SIM1",
                mode,
                ...(mode === "server"
                  ? { password: values.get("password") }
                  : {}),
              });
              element.reset();
              setId(result.id);
              setJournal(null);
              setForm(false);
            });
          }}
        >
          <h2>
            {tr(
              "FundingPips · read-only connection",
              "FundingPips · доступ только для чтения",
            )}
          </h2>
          <p>
            {mode === "local"
              ? tr(
                  "Read history from MT5 on your Windows PC. Your broker password stays on that PC. After saving, choose Use Windows PC to pair the connector.",
                  "Импортируйте историю из MT5 на ПК Windows. Пароль брокера остаётся на ПК. После сохранения нажмите «Использовать ПК Windows».",
                )
              : tr(
                  "Enter your MT5 account number and investor password. Saving the connection does not import trades; use Sync now afterwards.",
                  "Введите номер счёта MT5 и пароль инвестора. После сохранения нажмите «Синхронизировать» для импорта сделок.",
                )}
          </p>
          <div
            className="mt5-actions"
            role="group"
            aria-label={tr("Sync location", "Место синхронизации")}
          >
            <button
              type="button"
              className="button secondary compact"
              aria-pressed={mode === "local"}
              onClick={() => setMode("local")}
            >
              {tr("Windows PC", "ПК Windows")}
            </button>
            <button
              type="button"
              className="button secondary compact"
              aria-pressed={mode === "server"}
              onClick={() => setMode("server")}
            >
              {tr("VPS worker", "Сервис на VPS")}
            </button>
          </div>
          <div className="mt5-form-grid">
            <label>
              {tr("Account label", "Название счёта")}
              <input
                name="label"
                defaultValue="FundingPips"
                required
                maxLength={80}
                autoComplete="off"
              />
            </label>
            <label>
              {tr("MT5 account number", "Номер счёта MT5")}
              <input
                name="login"
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                required
                autoComplete="off"
              />
            </label>
            <label>
              {tr("Server", "Сервер")}
              <input value="FundingPips-SIM1" readOnly />
            </label>
            {mode === "server" && (
              <label>
                {tr("Investor password", "Пароль инвестора")}
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="new-password"
                />
              </label>
            )}
          </div>
          <button
            className="button primary compact"
            disabled={busy || !state?.configured}
          >
            {tr("Save connection", "Сохранить подключение")}
          </button>
        </form>
      )}
      {account && (
        <>
          <div className="mt5-sync-status">
            <div>
              <strong>{account.server}</strong>
              <p aria-live="polite">
                {running
                  ? tr("Sync in progress…", "Синхронизация…")
                  : account.lastSync
                    ? `${tr("Last synced", "Синхронизировано")}: ${new Date(account.lastSync).toLocaleString()}`
                    : tr(
                        "No trades imported yet",
                        "Сделки ещё не импортированы",
                      )}
                {!account.connected && ` · ${tr("Disconnected", "Отключено")}`}
              </p>
            </div>
            <div className="mt5-actions">
              <button
                className="button primary compact"
                disabled={busy || running || !account.connected || !online}
                onClick={() =>
                  void action(async () => {
                    await api(`connections/${id}/sync`, "POST");
                  })
                }
              >
                {tr("Sync now", "Синхронизировать")}
              </button>
              <button
                className="button secondary compact"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const result = await api(
                      `connections/${id}/windows`,
                      "POST",
                    );
                    setPairing({ id, token: result.token });
                  })
                }
              >
                {tr("Use Windows PC", "Использовать ПК Windows")}
              </button>
              <button
                className="button secondary compact"
                disabled={busy || !account.connected}
                onClick={() =>
                  void action(async () => {
                    await api(`connections/${id}`, "DELETE");
                  })
                }
              >
                {tr("Disconnect", "Отключить")}
              </button>
            </div>
          </div>
          {pairing?.id === id && (
            <section
              className="mt5-connect"
              aria-label={tr(
                "Windows connector setup",
                "Настройка коннектора Windows",
              )}
            >
              <h2>{tr("Connect your Windows PC", "Подключите ПК Windows")}</h2>
              <ol>
                <li>
                  {tr(
                    "Download and extract the connector on the Windows PC where you use MT5.",
                    "Скачайте и распакуйте коннектор на ПК Windows с MT5.",
                  )}{" "}
                  <a
                    className="button secondary compact"
                    href="/downloads/eazy-trading-windows-connector.zip"
                    download
                  >
                    {tr(
                      "Download Windows connector",
                      "Скачать коннектор Windows",
                    )}
                  </a>
                </li>
                <li>
                  {tr(
                    "Install Python 3.14 (64-bit) with its launcher, then open MT5 and sign in normally.",
                    "Установите Python 3.14 (64-бит) с launcher, откройте MT5 и войдите как обычно.",
                  )}{" "}
                  <a
                    href="https://www.python.org/downloads/windows/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Python
                  </a>
                </li>
                <li>
                  {tr(
                    "Double-click Start Connector.cmd. Enter this website address and paste the pairing key below. Leave the connector window open, then click Sync now here.",
                    "Запустите Start Connector.cmd, введите адрес сайта и ключ ниже. Оставьте окно коннектора открытым и нажмите «Синхронизировать» здесь.",
                  )}
                </li>
              </ol>
              <label>
                {tr("Website address", "Адрес сайта")}
                <input
                  readOnly
                  value={
                    typeof window === "undefined" ? "" : window.location.origin
                  }
                />
              </label>
              <label>
                {tr(
                  "One-time pairing key",
                  "Ключ сопряжения (показан один раз)",
                )}
                <input
                  type="password"
                  readOnly
                  value={pairing.token}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                className="button secondary compact"
                onClick={() =>
                  void action(async () => {
                    await navigator.clipboard.writeText(pairing.token);
                  })
                }
              >
                {tr("Copy pairing key", "Скопировать ключ")}
              </button>
              <p>
                {tr(
                  "This key is limited to this account. It is shown only now; never send it in chat. Pairing again revokes the previous key. The server's saved investor password has been removed.",
                  "Ключ действует только для этого счёта и показан один раз. Не отправляйте его в чат. Новый ключ отменяет предыдущий. Сохранённый на сервере пароль инвестора удалён.",
                )}
              </p>
            </section>
          )}
          {account.job?.status === "failed" && (
            <p role="status" className="mt5-error">
              {statusMessages[account.job.error || ""] ||
                statusMessages.COLLECTOR_FAILED}
            </p>
          )}
          {journal && (
            <>
              <div className="mt5-stats">
                <div>
                  <span>
                    {tr("Closed trade result", "Результат закрытых сделок")}
                  </span>
                  <strong>{money(journal.summary.net)}</strong>
                </div>
                <div>
                  <span>{tr("Closed trades", "Закрытые сделки")}</span>
                  <strong>{journal.summary.closed}</strong>
                </div>
                <div>
                  <span>{tr("Win rate", "Доля прибыльных")}</span>
                  <strong>
                    {journal.summary.closed
                      ? `${Math.round((journal.summary.wins / journal.summary.closed) * 100)}%`
                      : "—"}
                  </strong>
                </div>
              </div>
              {!!journal.warnings && (
                <p className="mt5-notice">
                  {tr(
                    "Some position histories are incomplete and are excluded from trade statistics. Raw broker history is retained.",
                    "История некоторых позиций неполная; они исключены из статистики. Исходные данные сохранены.",
                  )}{" "}
                  ({journal.warnings})
                </p>
              )}
              {!!journal.positions.length && (
                <section className="journal-card">
                  <div className="journal-header">
                    <h2>
                      {tr(
                        "Open positions at last sync",
                        "Открытые позиции на момент синхронизации",
                      )}
                    </h2>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Symbol",
                            "Side",
                            "Lots",
                            "Entry",
                            "SL",
                            "TP",
                            "Floating P/L",
                          ].map((x) => (
                            <th key={x}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {journal.positions.map((p) => (
                          <tr key={p.ticket}>
                            <td>{p.symbol}</td>
                            <td>{p.side}</td>
                            <td>{p.volume}</td>
                            <td>{p.price}</td>
                            <td>{p.sl || "—"}</td>
                            <td>{p.tp || "—"}</td>
                            <td>{money(p.profit + p.swap)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="journal-card">
                <div className="journal-header">
                  <div>
                    <h2>{tr("MT5 trade journal", "Журнал сделок MT5")}</h2>
                    <p>
                      {tr(
                        "Broker time · lots · account currency. R requires your planned risk.",
                        "Время брокера · лоты · валюта счёта. Для R укажите плановый риск.",
                      )}
                    </p>
                  </div>
                  <label className="mt5-search">
                    {tr("Search", "Поиск")}
                    <input
                      type="search"
                      placeholder={tr(
                        "Symbol, strategy, note or tag",
                        "Символ, стратегия, заметка или тег",
                      )}
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          tr(
                            "Instrument / broker time",
                            "Инструмент / время брокера",
                          ),
                          tr("Side", "Сторона"),
                          tr("Lots", "Лоты"),
                          tr("Entry", "Вход"),
                          tr("Exit", "Выход"),
                          tr("Net result", "Чистый результат"),
                          "R",
                          tr("Notes", "Заметки"),
                        ].map((x) => (
                          <th key={x}>{x}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {journal.trades.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.symbol}</strong>
                            <small className="mt5-time">
                              {time(t.openedAt)}
                            </small>
                          </td>
                          <td>{t.side}</td>
                          <td>{t.volume}</td>
                          <td>{t.entryPrice}</td>
                          <td>
                            {t.closedAt !== null
                              ? t.exitPrice
                              : tr("Open", "Открыта")}
                          </td>
                          <td>
                            {money(t.net)}
                            {t.closedAt === null && " *"}
                          </td>
                          <td>
                            {t.closedAt !== null && t.annotation.plannedRisk
                              ? (t.net / t.annotation.plannedRisk).toFixed(2)
                              : "—"}
                          </td>
                          <td>
                            <button
                              className="button secondary compact"
                              onClick={() => {
                                setTrade(t);
                                setDraft({ ...t.annotation });
                              }}
                            >
                              {t.annotation.strategy ||
                                tr("Details & notes", "Детали и заметки")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!journal.total && (
                  <p className="mt5-notice">
                    {tr(
                      "No matching trades. Sync your account to import broker history.",
                      "Нет подходящих сделок. Синхронизируйте счёт для импорта истории.",
                    )}
                  </p>
                )}
                <div className="mt5-pagination">
                  <button
                    className="button secondary compact"
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {tr("Previous", "Назад")}
                  </button>
                  <span>
                    {page + 1} / {Math.max(1, Math.ceil(journal.total / 100))}
                  </span>
                  <button
                    className="button secondary compact"
                    disabled={(page + 1) * 100 >= journal.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {tr("Next", "Далее")}
                  </button>
                </div>
              </section>
              {!!journal.trades.some((t) => t.closedAt === null) && (
                <p className="mt5-notice">
                  *{" "}
                  {tr(
                    "Open trade results contain realized partial exits and costs only. Floating P/L is shown above and is not live.",
                    "Результат открытой сделки включает только частичные закрытия и издержки. Плавающий результат показан выше и обновляется при синхронизации.",
                  )}
                </p>
              )}
              {!!journal.adjustments.length && (
                <details className="mt5-notice">
                  <summary>
                    {tr("Broker cash operations", "Денежные операции брокера")}{" "}
                    ({journal.adjustments.length})
                  </summary>
                  <p>
                    {tr(
                      "Deposits, withdrawals and separate charges are excluded from trade statistics.",
                      "Пополнения, выводы и отдельные начисления исключены из статистики сделок.",
                    )}
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Ticket</th>
                          <th>MT5 type</th>
                          <th>{tr("Amount", "Сумма")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journal.adjustments.map((d) => (
                          <tr key={d.ticket}>
                            <td>{d.ticket}</td>
                            <td>{d.type}</td>
                            <td>
                              {money(d.profit + d.commission + d.swap + d.fee)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          )}
        </>
      )}
      {state && !state.accounts.length && !form && (
        <p className="mt5-notice">
          {tr(
            "Connect your FundingPips account to collect trades here. Only your investor password is needed.",
            "Подключите счёт FundingPips для импорта сделок. Используйте пароль инвестора.",
          )}
        </p>
      )}
      {trade && (
        <dialog
          ref={dialog}
          className="mt5-modal"
          aria-labelledby="mt5-trade-title"
          onCancel={() => setTrade(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setTrade(null);
          }}
        >
          <section className="mt5-trade-detail">
            <h2 id="mt5-trade-title">
              {trade.symbol} · {trade.side} · {trade.volume}{" "}
              {tr("lots", "лотов")}
            </h2>
            <p>
              {time(trade.openedAt)} →{" "}
              {trade.closedAt === null
                ? tr("Open", "Открыта")
                : time(trade.closedAt)}{" "}
              · {tr("Broker time", "Время брокера")}
            </p>
            <p>
              {tr("Profit", "Прибыль")}: {money(trade.profit)} ·{" "}
              {tr("Commission", "Комиссия")}: {money(trade.commission)} · Swap:{" "}
              {money(trade.swap)} · {tr("Fees", "Сборы")}: {money(trade.fee)}
            </p>
            <p>
              {tr("Deal tickets", "Номера сделок")}: {trade.fills.join(", ")}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api(
                    `connections/${id}/trades/${encodeURIComponent(trade.id)}`,
                    "PATCH",
                    draft,
                  );
                  setTrade(null);
                });
              }}
            >
              <label>
                {tr("Strategy", "Стратегия")}
                <input
                  autoFocus
                  value={draft.strategy}
                  maxLength={100}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, strategy: e.target.value }))
                  }
                />
              </label>
              <label>
                {tr("Tags (comma separated)", "Теги (через запятую)")}
                <input
                  defaultValue={draft.tags.join(", ")}
                  maxLength={1000}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      tags: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </label>
              <label>
                {tr("Planned initial risk", "Плановый начальный риск")} (
                {journal?.currency})
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={draft.plannedRisk ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      plannedRisk: e.target.value
                        ? Number(e.target.value)
                        : null,
                    }))
                  }
                />
              </label>
              <label>
                {tr("Notes", "Заметки")}
                <textarea
                  rows={5}
                  maxLength={10000}
                  value={draft.note}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, note: e.target.value }))
                  }
                />
              </label>
              <div className="mt5-actions">
                <button
                  type="submit"
                  className="button primary compact"
                  disabled={busy}
                >
                  {tr("Save notes", "Сохранить заметки")}
                </button>
                <button
                  type="button"
                  className="button secondary compact"
                  onClick={() => setTrade(null)}
                >
                  {tr("Close", "Закрыть")}
                </button>
              </div>
              {error && (
                <p role="alert" className="mt5-error">
                  {error}
                </p>
              )}
            </form>
          </section>
        </dialog>
      )}
    </div>
  );
}
