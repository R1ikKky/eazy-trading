import { dayKey } from "./engine";

const endpoint = "https://www.hfmarketdata.io";
export function historyRequest(root: any, from: any, to: any, key = "") {
  key = key.trim();
  if (
    !["NQ", "ES"].includes(root) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw Error("Проверьте инструмент и диапазон дат.");
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (
    !Number.isFinite(days) ||
    from < "2024-01-02" ||
    to > dayKey(Date.now() / 1000)
  )
    throw Error("Выберите даты с 2 января 2024 года до сегодняшнего дня.");
  if (days > (key ? 366 : 31))
    throw Error(
      key
        ? "С ключом можно загрузить до 366 дней за один раз."
        : "Без ключа можно загрузить до 31 дня за один раз. Для длинного периода доступен бесплатный ключ HF Market Data.",
    );
  return { root, from, to, days, key };
}

export function validateProviderBars(rows: any, root: any) {
  if (!Array.isArray(rows))
    throw Error("Источник вернул неизвестный формат данных.");
  return rows.map((b) => {
    const time = Date.parse(b.datetime) / 1000,
      prices = ["open", "high", "low", "close"].map((k) => b[k]);
    if (
      !Number.isSafeInteger(time) ||
      time % 60 ||
      prices.some(
        (v) =>
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          v <= 0 ||
          Math.abs(v * 4 - Math.round(v * 4)) > 1e-6,
      ) ||
      b.high < Math.max(b.open, b.close) ||
      b.low > Math.min(b.open, b.close) ||
      typeof b.volume !== "number" ||
      !Number.isFinite(b.volume) ||
      b.volume < 0 ||
      typeof b.symbol !== "string" ||
      !new RegExp("^" + root + "[A-Z][0-9]{2,4}$").test(b.symbol)
    )
      throw Error(
        "Источник вернул некорректную свечу. Текущая история сохранена.",
      );
    return {
      time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      contract: b.symbol,
    };
  });
}

export async function loadHistory(
  request: any,
  onProgress: any = () => {},
  signal: any,
) {
  const { root, from, to, days, key } = request,
    headers = key ? { Authorization: "Bearer " + key } : {};
  async function read(url: any) {
    const response = await fetch(url, { headers, signal, credentials: "omit" });
    if (response.status === 429) {
      const reset = Number(response.headers.get("X-RateLimit-Reset")),
        when = reset ? new Date(reset * 1000).toLocaleTimeString("ru-RU") : "";
      throw Error(
        "Лимит источника исчерпан." +
          (when ? " Повторите после " + when + "." : " Повторите позже.") +
          " Можно подключить бесплатный ключ HF Market Data. Текущие данные сохранены.",
      );
    }
    if (response.status === 401 || response.status === 403)
      throw Error(
        "Источник не принял API-ключ. Проверьте ключ HF Market Data.",
      );
    if (!response.ok)
      throw Error(
        "Исторический источник недоступен (HTTP " +
          response.status +
          "). Попробуйте позже или импортируйте CSV.",
      );
    return response.json();
  }
  onProgress("Проверяю доступный лимит…");
  const limits = await read(endpoint + "/v1/limits");
  const principal = limits.data?.principal;
  const pageSize = Math.min(principal?.max_rows_per_request || 5000, 50000);
  const estimate = days * 1440,
    credits = 2 * Math.ceil(estimate / pageSize);
  if (
    principal &&
    (principal.requests.remaining < credits ||
      principal.rows.remaining < estimate)
  )
    throw Error(
      "Для этого периода недостаточно текущего лимита. Уменьшите диапазон, дождитесь обновления лимита или используйте бесплатный ключ. Текущая история сохранена.",
    );
  const base = new URL(endpoint + "/v1/futures/" + root + "/continuous");
  Object.entries<any>({
    interval: "1m",
    from,
    to,
    session: "all",
    roll: "volume",
    adjust: "none",
    depth: "1",
    limit: String(pageSize),
  }).forEach(([k, v]) => base.searchParams.set(k, v));
  const bars = [],
    seen = new Set();
  let cursor = null,
    meta: Record<string, any> = {};
  do {
    const url = new URL(base);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await read(url);
    meta = response.meta || {};
    bars.push(...validateProviderBars(response.data, root));
    onProgress(
      "Загружено " + bars.length.toLocaleString("ru-RU") + " минутных свечей…",
    );
    cursor = meta.next_cursor || null;
    if (cursor) {
      if (seen.has(cursor))
        throw Error(
          "Источник повторил страницу. Загрузка остановлена; прежняя история сохранена.",
        );
      seen.add(cursor);
    }
    if (bars.length > 600000)
      throw Error("Слишком большой ответ источника. Выберите меньший период.");
  } while (cursor);
  if (bars.length < 2)
    throw Error(
      "В эти даты нет достаточного количества свечей. Выберите торговые дни.",
    );
  for (let i = 1; i < bars.length; i++)
    if (bars[i].time <= bars[i - 1].time)
      throw Error("Источник вернул повторяющиеся или неупорядоченные свечи.");
  const dateKeys = bars.map((b) => dayKey(b.time));
  if (dateKeys[0] < from || dateKeys.at(-1) > to)
    throw Error("Источник вернул свечи за пределами выбранных дат.");
  return {
    bars,
    days: dateKeys,
    isDemo: false,
    source: "hf_market_data",
    name: "FirstRate Data via HF Market Data · " + root,
    metadata: {
      sourceUrl: endpoint + "/docs",
      fetchedAt: new Date().toISOString(),
      roll: "volume",
      adjust: "none",
      session: "all",
      contracts: [...new Set(bars.map((b) => b.contract))],
      requestedFrom: from,
      requestedTo: to,
      firstTime: bars[0].time,
      lastTime: bars.at(-1).time,
    },
  };
}

async function cacheDB() {
  if (!globalThis.indexedDB) return null;
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("replay-lab-history", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveHistory(root: any, dataset: any) {
  const db = await cacheDB();
  if (!db) return false;
  return new Promise((resolve: any, reject: any) => {
    const tx = db.transaction("history", "readwrite");
    tx.objectStore("history").put(dataset, root);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function cachedHistory(root: any) {
  const db = await cacheDB();
  if (!db) return null;
  return new Promise((resolve: any, reject: any) => {
    const request = db.transaction("history").objectStore("history").get(root);
    request.onsuccess = () => {
      const value = request.result;
      db.close();
      resolve(
        value?.bars?.length > 1 && value.source === "hf_market_data"
          ? value
          : null,
      );
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
