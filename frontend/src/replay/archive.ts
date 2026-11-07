import { parseCSV, dayKey } from "./engine";
const ny = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function easternTimestamp(text: any, previous = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
    text,
  );
  if (!match)
    throw Error("FirstRate: ожидается дата yyyy-MM-dd HH:mm:ss по Нью-Йорку");
  const raw =
      Date.UTC(
        ...[
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        ],
      ) / 1000,
    wanted =
      match[1] +
      "-" +
      match[2] +
      "-" +
      match[3] +
      " " +
      match[4] +
      ":" +
      match[5] +
      ":" +
      match[6];
  const options = [raw + 14400, raw + 18000].filter(
    (t) =>
      t > previous && ny.format(new Date(t * 1000)).replace(",", "") === wanted,
  );
  if (!options.length)
    throw Error("Невозможная или неупорядоченная дата по Нью-Йорку: " + text);
  return Math.min(...options);
}

// Bounded, backpressured import: only a parsing block and one month stay in memory.
export async function importArchive(
  file: any,
  { symbol, onPart, onProgress = () => {}, signal, format = "standard" }: any,
) {
  if (!["NQ", "ES"].includes(symbol) || !file?.stream)
    throw Error("Выберите CSV для NQ или ES");
  if (file.size > 250 * 1024 * 1024)
    throw Error("Максимальный размер CSV — 250 МБ");
  const reader = file.stream().getReader(),
    decoder = new TextDecoder();
  let carry = "",
    header = "",
    block: any = [],
    month = "",
    part: any = [],
    last = 0,
    count = 0,
    firstTime = null,
    hasContracts = true,
    localPrevious = 0,
    minuteEvidence = false;
  const parts: any = [];
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Импорт остановлен", "AbortError");
  };
  async function flush() {
    if (!part.length) return;
    check();
    const saved: any = await onPart(part, parts.length);
    parts.push({
      ...saved,
      firstTime: part[0].time,
      lastTime: part.at(-1).time,
      count: part.length,
    });
    part = [];
    onProgress({ count, parts: parts.length, bytes: file.size });
  }
  async function parse() {
    if (!block.length) return;
    check();
    let rows;
    try {
      rows = parseCSV(header + "\n" + block.join("\n"), {
        minRows: 1,
        requireMinuteEvidence: false,
      });
    } catch (error) {
      throw Error(
        "После " + count.toLocaleString("ru-RU") + " свечей: " + error.message,
      );
    }
    block = [];
    for (const b of rows) {
      if (b.time <= last)
        throw Error(
          "CSV должен идти строго по времени без повторов, в том числе между файлами",
        );
      if (b.contract && !b.contract.startsWith(symbol))
        throw Error("Контракт в CSV не соответствует выбранному " + symbol);
      if (last && b.time - last === 60) minuteEvidence = true;
      last = b.time;
      firstTime ??= b.time;
      hasContracts &&= !!b.contract;
      if (++count > 3000000) throw Error("Максимум 3 000 000 свечей в архиве");
      const next = dayKey(b.time).slice(0, 7);
      if (month && next !== month) await flush();
      month = next;
      part.push(b);
      if (part.length === 50000) await flush();
    }
    onProgress({ count, parts: parts.length });
    await new Promise((resolve: any) => setTimeout(resolve, 0));
  }
  async function line(value: any) {
    value = value.replace(/^\uFEFF/, "");
    if (!value.trim()) return;
    if (value.length > 4096) throw Error("Слишком длинная строка CSV");
    if (format === "firstrate") {
      if (!header) {
        if (/open/i.test(value)) {
          header = value;
          return;
        }
        header = "time,open,high,low,close,volume";
      }
      const comma = value.indexOf(",");
      if (comma < 0) throw Error("FirstRate: нужен CSV с запятыми");
      const stamp = value.slice(0, comma).replace(/^"|"$/g, "");
      localPrevious = easternTimestamp(stamp, localPrevious);
      value = localPrevious + value.slice(comma);
    } else if (!header) {
      header = value;
      return;
    }
    block.push(value);
    if (block.length >= 5000) await parse();
  }
  try {
    for (;;) {
      check();
      const { done, value } = await reader.read();
      carry += decoder.decode(value || new Uint8Array(), { stream: !done });
      let end;
      while ((end = carry.indexOf("\n")) !== -1) {
        const value = carry.slice(0, end).replace(/\r$/, "");
        carry = carry.slice(end + 1);
        await line(value);
      }
      if (carry.length > 4096)
        throw Error("CSV содержит слишком длинную или повреждённую строку");
      if (done) break;
    }
    if (carry.trim()) await line(carry.replace(/\r$/, ""));
    await parse();
    if (count < 2) throw Error("Нужно минимум две свечи");
    if (!minuteEvidence)
      throw Error(
        "В CSV не подтверждён минутный интервал. Выберите 1m, не старший таймфрейм.",
      );
    await flush();
    return { parts, count, firstTime, lastTime: last, hasContracts };
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function archiveParts(manifest: any, from: any, to: any) {
  if (
    manifest?.kind !== "archive" ||
    !Array.isArray(manifest.parts) ||
    manifest.parts.length > 72 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw Error("Некорректный архив или диапазон");
  const context = new Date(from + "T12:00:00Z");
  context.setUTCDate(context.getUTCDate() - 35);
  const start = context.toISOString().slice(0, 10);
  return manifest.parts.filter(
    (p: any) => dayKey(p.lastTime) >= start && dayKey(p.firstTime) <= to,
  );
}

export async function readArchive(
  manifest: any,
  from: any,
  to: any,
  readPart: any,
) {
  if (from < dayKey(manifest.firstTime) || to > dayKey(manifest.lastTime))
    throw Error("Диапазон выходит за загруженный архив");
  const selected = archiveParts(manifest, from, to);
  let count = 0;
  for (const p of selected) count += p.count;
  if (count > 1000000)
    throw Error(
      "Архив доступен полностью, но для одной сессии выберите меньший диапазон (до 1 млн свечей вместе с контекстом)",
    );
  const bars = [];
  let previous = 0;
  for (const p of selected) {
    const d = await readPart(p.id);
    if (
      d.symbol !== manifest.symbol ||
      !Array.isArray(d.bars) ||
      d.bars.length !== p.count ||
      d.bars[0]?.time !== p.firstTime ||
      d.bars.at(-1)?.time !== p.lastTime
    )
      throw Error("Часть архива не соответствует индексу");
    for (const b of d.bars) {
      if (b.time <= previous) throw Error("Нарушен порядок частей архива");
      previous = b.time;
      if (dayKey(b.time) <= to) bars.push(b);
    }
  }
  if (bars.length < 2) throw Error("В выбранном диапазоне недостаточно свечей");
  return {
    ...manifest,
    bars,
    days: bars.map((b) => dayKey(b.time)),
    archive: manifest,
    loadedRange: { from, to },
    isDemo: false,
  };
}
