import { dayKey } from "./engine";
import { isRegularSession } from "./settings-model";
import {
  curatedArchives,
  isSupersededCuratedDataset,
  currentCuratedArchive,
} from "./curated-data";

const validDate = (value: any) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
const manifests = new Map<string, any>(curatedArchives.map((a) => [a.id, a]));

// A test uses one price series. Adjusted alternatives and retired versions are
// never substituted into an automatically selected series.
export function historyChoices(records: any, symbol: any, preferredId?: any) {
  const current = currentCuratedArchive(preferredId);
  preferredId = current?.id || preferredId;
  return Object.values<any>(records || {})
    .filter(
      (d) =>
        d.symbol === symbol &&
        validDate(d.from) &&
        validDate(d.to) &&
        d.from <= d.to &&
        !isSupersededCuratedDataset(d.id) &&
        !manifests.get(d.id)?.metadata?.adjusted,
    )
    .sort((a, b) => {
      const rank = (d: any) =>
        d.id === preferredId
          ? 0
          : manifests.has(d.id)
            ? 1
            : d.source === "user_csv"
              ? 2
              : 3;
      return (
        rank(a) - rank(b) ||
        a.from.localeCompare(b.from) ||
        a.id.localeCompare(b.id)
      );
    });
}

export function historyWindows(records: any, symbol: any) {
  const windows: any = [];
  for (const d of historyChoices(records, symbol).sort(
    (a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to),
  )) {
    if (!windows.some((w) => d.from >= w.from && d.to <= w.to))
      windows.push({ from: d.from, to: d.to });
  }
  return windows;
}

export function selectHistory(
  records: any,
  symbol: any,
  from: any,
  to: any,
  preferredId?: any,
) {
  if (!["NQ", "ES"].includes(symbol)) throw Error("Выберите NQ или ES");
  if (!validDate(from) || !validDate(to) || from > to)
    throw Error("Проверьте начальную и конечную даты");
  const choices = historyChoices(records, symbol, preferredId),
    selected = choices.find((d) => d.from <= from && d.to >= to);
  if (selected) return selected;
  const windows = historyWindows(records, symbol);
  if (!windows.length)
    throw Error("Для " + symbol + " пока нет исторических данных");
  throw Error(
    "За весь выбранный период данных нет. Даты с данными: " +
      windows.map((w) => w.from + " — " + w.to).join("; ") +
      ". Выберите период внутри одного из этих промежутков.",
  );
}

export function selectHistories(
  records: any,
  symbols: any,
  from: any,
  to: any,
  preferredId?: any,
) {
  if (
    !Array.isArray(symbols) ||
    !symbols.length ||
    symbols.length > 2 ||
    new Set(symbols).size !== symbols.length ||
    symbols.some((s) => !["NQ", "ES"].includes(s))
  )
    throw Error("Выберите хотя бы один инструмент: NQ или ES");
  return symbols.map((symbol) => {
    try {
      return selectHistory(records, symbol, from, to, preferredId);
    } catch (error) {
      throw Error(symbol + ": " + error.message);
    }
  });
}

export function commonHistoryWindows(records: any, symbols: any) {
  if (!symbols.length) return [];
  let windows = historyWindows(records, symbols[0]);
  for (const symbol of symbols.slice(1))
    windows = windows.flatMap((a) =>
      historyWindows(records, symbol)
        .map((b) => ({
          from: a.from > b.from ? a.from : b.from,
          to: a.to < b.to ? a.to : b.to,
        }))
        .filter((w) => w.from <= w.to),
    );
  const result: any = [];
  for (const w of windows.sort(
    (a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to),
  ))
    if (!result.some((r) => r.from <= w.from && r.to >= w.to)) result.push(w);
  return result;
}

export function selectReplayBars(
  dataset: any,
  from: any,
  to: any,
  session: any,
) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw Error("Начальная дата должна быть не позже конечной.");
  const first = dataset.loadedRange?.from || dataset.days[0],
    last = dataset.loadedRange?.to || dataset.days.at(-1);
  if (from < first || to > last)
    throw Error("Для этих дат сначала загрузите исторические данные.");
  const start = dataset.days.findIndex((day: any) => day >= from);
  let end = dataset.days.findIndex((day: any) => day > to);
  if (end === -1) end = dataset.bars.length;
  if (start === -1 || end - start < 2)
    throw Error(
      "В выбранном периоде меньше двух свечей. Выберите торговые дни.",
    );
  const keep = (bar: any) => session !== "rth" || isRegularSession(bar.time),
    bars = dataset.bars.slice(start, end).filter(keep);
  if (bars.length < 2) throw Error("В выбранной сессии меньше двух свечей.");
  return {
    bars,
    context: dataset.bars.slice(Math.max(0, start - 30000), start).filter(keep),
  };
}
