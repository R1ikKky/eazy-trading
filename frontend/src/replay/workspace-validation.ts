// Validate before replacing live state. This module deliberately does not
// authenticate executions: Replay.restore validates them against market bars.
const own = (o: any, key: any) => Object.prototype.hasOwnProperty.call(o, key);
const object = (value: any) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const BAD_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const VIEWS = new Set([
  "replay",
  "sessions",
  "journal",
  "analytics",
  "playbooks",
  "data",
]);
const SOURCES = new Set(["hf_market_data", "user_csv", "curated_archive"]);
const fail = (detail: any) => {
  throw Error(
    "Некорректное рабочее пространство: " +
      detail +
      ". Исходные данные не изменены.",
  );
};
const isId = (value: any) =>
  typeof value === "string" && ID.test(value) && !BAD_KEYS.has(value);
const integer = (value: any, min: any, max: any) =>
  Number.isSafeInteger(value) && value >= min && value <= max;
const number = (value: any, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const price = (value: any) => number(value, Number.MIN_VALUE, 100000000);
const timestamp = (value: any) =>
  integer(value, 1, 4102444800) && value % 60 === 0;
function text(value: any, max: any, label: any, empty = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    fail(label);
  return value;
}
function id(value: any, label: any, empty = false) {
  if (empty && value === "") return "";
  if (!isId(value)) fail(label);
  return value;
}
function day(value: any, label: any) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(label);
  const n = Date.parse(value + "T12:00:00Z");
  if (
    !Number.isFinite(n) ||
    new Date(n).toISOString().slice(0, 10) !== value ||
    value < "2000-01-01" ||
    value > "2100-01-01"
  )
    fail(label);
  return value;
}
function instant(value: any, label: any) {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  )
    fail(label);
  const n = Date.parse(value);
  if (!Number.isFinite(n)) fail(label);
  return new Date(n).toISOString();
}
function clonePlain(value: any) {
  const seen = new Set();
  let nodes = 0;
  function visit(value: any, depth: any) {
    if (++nodes > 300000 || depth > 30) fail("слишком сложная структура");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 100000) fail("слишком длинное поле");
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("нечисловое значение");
      return value;
    }
    if ((!object(value) && !Array.isArray(value)) || seen.has(value))
      fail("повреждённая структура");
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      if (value.length > 150000) fail("слишком большой массив");
      result = value.map((x) => visit(x, depth + 1));
    } else {
      if (Object.keys(value).length > 50000) fail("слишком много полей");
      result = {};
      for (const key of Object.keys(value)) {
        if (BAD_KEYS.has(key) || key.length > 200)
          fail("недопустимое имя поля");
        result[key] = visit(value[key], depth + 1);
      }
    }
    seen.delete(value);
    return result;
  }
  return visit(value, 0);
}
function annotation(value: any) {
  if (!object(value)) fail("разбор сделки");
  const out: Record<string, any> = {};
  if (own(value, "notes"))
    out.notes = text(value.notes, 10000, "заметка сделки");
  if (own(value, "strategyId"))
    out.strategyId = id(value.strategyId, "стратегия сделки", true);
  if (own(value, "tags")) {
    if (!Array.isArray(value.tags) || value.tags.length > 20)
      fail("теги сделки");
    out.tags = [
      ...new Set(value.tags.map((x: any) => text(x, 64, "тег", false))),
    ];
  }
  if (own(value, "checklist")) {
    if (!object(value.checklist) || Object.keys(value.checklist).length > 30)
      fail("чеклист");
    out.checklist = {};
    for (const [key, checked] of Object.entries<any>(value.checklist)) {
      if (!/^(?:[0-9]|[12][0-9])$/.test(key) || typeof checked !== "boolean")
        fail("пункт чеклиста");
      out.checklist[key] = checked;
    }
  }
  if (own(value, "attachments")) {
    if (!Array.isArray(value.attachments) || value.attachments.length > 10)
      fail("изображения сделки");
    const seen = new Set();
    out.attachments = value.attachments.map((a: any) => {
      if (!object(a)) fail("изображение сделки");
      const attachmentId = id(a.id, "идентификатор изображения");
      if (
        seen.has(attachmentId) ||
        a.url !== "/api/attachments/" + attachmentId
      )
        fail("ссылка на личное изображение");
      seen.add(attachmentId);
      return {
        id: attachmentId,
        url: a.url,
        name: text(a.name ?? "Скриншот", 120, "название изображения"),
      };
    });
  }
  // Never retain entry/exit/pnl/id from annotations, even in a valid archive.
  return out;
}
function drawings(value: any = []) {
  if (!Array.isArray(value) || value.length > 500)
    fail("разметка: максимум 500 объектов");
  const seen = new Set();
  const point = (p: any) => {
    if (!object(p) || !number(p.time, 1, 4102444800) || !price(p.price))
      fail("координаты разметки");
    return { time: p.time, price: p.price };
  };
  return value.map((d: any) => {
    if (!object(d) || !["level", "ray", "trend", "zone"].includes(d.type))
      fail("тип разметки");
    const drawingId = id(d.id, "идентификатор разметки");
    if (
      seen.has(drawingId) ||
      !timestamp(d.createdAt) ||
      typeof d.color !== "string" ||
      !/^#[a-f0-9]{6}$/i.test(d.color) ||
      !number(d.width, 1, 4) ||
      !number(d.opacity, 0, 100)
    )
      fail("параметры разметки");
    if (
      (d.dashed !== undefined && typeof d.dashed !== "boolean") ||
      (d.hidden !== undefined && typeof d.hidden !== "boolean")
    )
      fail("видимость разметки");
    seen.add(drawingId);
    const b = d.b == null ? null : point(d.b);
    if (["trend", "zone"].includes(d.type) && !b) fail("вторая точка разметки");
    return {
      id: drawingId,
      type: d.type,
      a: point(d.a),
      b,
      createdAt: d.createdAt,
      color: d.color,
      width: d.width,
      opacity: d.opacity,
      dashed: d.dashed ?? false,
      hidden: d.hidden ?? false,
    };
  });
}
function snapshot(value: any, symbol: any) {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.symbol !== symbol ||
    !integer(value.index, 0, 999999) ||
    !timestamp(value.currentTime) ||
    typeof value.dataSignature !== "string" ||
    !/^[a-f0-9]{1,8}$/i.test(value.dataSignature) ||
    !Array.isArray(value.trades) ||
    value.trades.length > 150000 ||
    typeof value.closePending !== "boolean"
  )
    fail("состояние реплея");
  const out = clonePlain(value),
    seen = new Set();
  function order(q: any, open = false) {
    if (
      !object(q) ||
      !isId(q.id) ||
      seen.has(q.id) ||
      ![1, -1].includes(q.side) ||
      !integer(q.qty, 1, 100) ||
      !["market", "limit", "stop"].includes(q.kind) ||
      !number(q.stop, 0.25) ||
      !number(q.target, 0.25) ||
      !number(q.fee, 0, 100) ||
      !integer(q.slip, 0, 100)
    )
      fail("заявка или позиция");
    if (
      (q.kind === "market" && q.entryPrice !== null) ||
      (q.kind !== "market" && !price(q.entryPrice))
    )
      fail("цена заявки");
    if (
      open &&
      (!price(q.entry) ||
        !price(q.sl) ||
        !price(q.tp) ||
        !timestamp(q.time) ||
        q.time > value.currentTime ||
        !number(q.realizedNet) ||
        !integer(q.initialQty, q.qty, 100))
    )
      fail("открытая позиция");
    seen.add(q.id);
  }
  for (const t of out.trades) {
    if (
      !object(t) ||
      !isId(t.id) ||
      seen.has(t.id) ||
      t.symbol !== symbol ||
      ![1, -1].includes(t.side) ||
      !integer(t.qty, 1, 100) ||
      !price(t.entry) ||
      !price(t.exit) ||
      !timestamp(t.time) ||
      !timestamp(t.exitTime) ||
      t.time > t.exitTime ||
      t.exitTime > value.currentTime ||
      !number(t.pnl) ||
      !number(t.gross) ||
      !number(t.fees, 0) ||
      (t.r !== undefined && t.r !== null && !number(t.r)) ||
      typeof t.reason !== "string" ||
      t.reason.length > 100 ||
      (t.ambiguous !== undefined && typeof t.ambiguous !== "boolean")
    )
      fail("закрытая сделка");
    if (
      Math.abs(t.pnl - (t.gross - t.fees)) >
      1e-7 * Math.max(1, Math.abs(t.pnl))
    )
      fail("расчёт результата сделки");
    seen.add(t.id);
    if (
      t.exits !== undefined &&
      (!Array.isArray(t.exits) ||
        t.exits.length > 100 ||
        t.exits.some(
          (e: any) =>
            !object(e) ||
            !integer(e.qty, 1, 100) ||
            !price(e.price) ||
            !timestamp(e.time) ||
            e.time < t.time ||
            e.time > t.exitTime ||
            !number(e.pnl),
        ))
    )
      fail("исполнения выхода");
  }
  if (out.position !== null) order(out.position, true);
  if (out.pending !== null) order(out.pending);
  if (out.position && out.pending) fail("одновременная позиция и заявка");
  if (
    out.closeQty !== null &&
    !integer(out.closeQty, 1, out.position?.qty || 0)
  )
    fail("объём ожидающего выхода");
  if (out.closePending && !out.position) fail("выход без позиции");
  return out;
}
function registry(value: any = {}) {
  if (!object(value) || Object.keys(value).length > 2000)
    fail("реестр исторических данных");
  const out: Record<string, any> = {};
  for (const [key, d] of Object.entries<any>(value)) {
    if (
      !isId(key) ||
      !object(d) ||
      d.id !== key ||
      !["NQ", "ES"].includes(d.symbol) ||
      !SOURCES.has(d.source) ||
      !integer(d.count, 1, 3000000)
    )
      fail("архив исторических данных");
    const from = day(d.from, "начало истории"),
      to = day(d.to, "конец истории");
    if (from > to) fail("диапазон истории");
    out[key] = {
      id: key,
      symbol: d.symbol,
      source: d.source,
      name: text(d.name, 180, "название истории", false),
      from,
      to,
      count: d.count,
      ...(d.kind === "archive"
        ? {
            kind: "archive",
            months: (Array.isArray(d.months) ? d.months : [])
              .filter(
                (x: any) =>
                  typeof x === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(x),
              )
              .slice(0, 72),
          }
        : {}),
    };
  }
  return out;
}
export function validateWorkspace(value: any) {
  if (
    !object(value) ||
    value.version !== 1 ||
    !integer(value.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > 1000 ||
    !Array.isArray(value.playbooks) ||
    value.playbooks.length > 100 ||
    !object(value.settings)
  )
    fail("версия, ревизия или список записей");
  const sessionIds = new Set(),
    strategyIds = new Set();
  const playbooks = value.playbooks.map((p: any) => {
    if (!object(p) || strategyIds.has(p.id)) fail("повторяющаяся стратегия");
    const strategyId = id(p.id, "идентификатор стратегии");
    strategyIds.add(strategyId);
    if (!Array.isArray(p.rules) || p.rules.length > 30)
      fail("правила стратегии");
    return {
      id: strategyId,
      name: text(p.name, 100, "название стратегии", false),
      description: text(p.description ?? "", 2000, "описание стратегии"),
      rules: p.rules.map((x: any) => text(x, 240, "правило стратегии", false)),
    };
  });
  const sessions = value.sessions.map((s: any) => {
    if (
      !object(s) ||
      sessionIds.has(s.id) ||
      !["NQ", "ES"].includes(s.symbol) ||
      !["all", "rth"].includes(s.session) ||
      !SOURCES.has(s.source) ||
      !number(s.capital, 100, 1000000000)
    )
      fail("параметры сессии");
    const sessionId = id(s.id, "идентификатор сессии");
    sessionIds.add(sessionId);
    const from = day(s.from, "начало сессии"),
      to = day(s.to, "конец сессии");
    if (from > to) fail("диапазон сессии");
    const createdAt = instant(s.createdAt, "дата создания"),
      updatedAt = instant(s.updatedAt, "дата изменения");
    if (updatedAt < createdAt) fail("дата изменения раньше создания");
    const annotations: Record<string, any> = {};
    if (s.annotations !== undefined) {
      if (!object(s.annotations) || Object.keys(s.annotations).length > 150000)
        fail("разборы сделок");
      for (const [key, a] of Object.entries<any>(s.annotations)) {
        id(key, "идентификатор разбора");
        annotations[key] = annotation(a);
      }
    }
    const comparison = own(s, "comparisonDatasetId")
      ? {
          comparisonDatasetId: id(
            s.comparisonDatasetId,
            "данные второго инструмента",
          ),
        }
      : {};
    if (comparison.comparisonDatasetId === s.datasetId)
      fail("одинаковые данные для двух инструментов");
    return {
      id: sessionId,
      name: text(s.name, 100, "название сессии", false),
      symbol: s.symbol,
      from,
      to,
      session: s.session,
      source: s.source,
      datasetId: id(s.datasetId, "исторические данные сессии"),
      ...comparison,
      capital: s.capital,
      strategyId: id(s.strategyId ?? "", "стратегия сессии", true),
      createdAt,
      updatedAt,
      snapshot: snapshot(s.snapshot, s.symbol),
      notes: text(s.notes ?? "", 10000, "заметка сессии"),
      annotations,
      drawings: drawings(s.drawings),
    };
  });
  const settings = clonePlain(value.settings);
  if (
    settings.activeSessionId !== undefined &&
    settings.activeSessionId !== null &&
    settings.activeSessionId !== ""
  )
    id(settings.activeSessionId, "активная сессия");
  if (settings.view !== undefined && !VIEWS.has(settings.view))
    fail("раздел интерфейса");
  if (
    settings.chartPreferences !== undefined &&
    !object(settings.chartPreferences)
  )
    fail("настройки графика");
  if (settings.datasets !== undefined)
    settings.datasets = registry(settings.datasets);
  return {
    version: 1,
    revision: value.revision,
    sessions,
    playbooks,
    settings,
  };
}
