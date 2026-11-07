import { marketArchives } from "./market-archives";
import { readArchive } from "./archive";

// Immutable, shipped market history. Personal CSV archives remain owner-scoped.
export const curatedArchives: any = marketArchives;
const archives = new Map(marketArchives.map((a) => [a.id, a]));
const parts = new Map(
  marketArchives.flatMap((a) =>
    a.parts.map((p) => [p.id, { archive: a, part: p }]),
  ),
);
export const isCuratedDataset = (id: any) => archives.has(id) || parts.has(id);
export const isSupersededCuratedDataset = (id: any) =>
  Boolean(archives.get(id)?.metadata?.supersededBy);
export function currentCuratedArchive(id: any) {
  let archive = archives.get(id);
  const seen = new Set();
  while (archive?.metadata?.supersededBy && !seen.has(archive.id)) {
    seen.add(archive.id);
    archive = archives.get(archive.metadata.supersededBy) || archive;
  }
  return archive;
}
export async function decodeCuratedPart(encoded: any, part: any, symbol: any) {
  if (encoded.length > 8 * 1024 * 1024 || !globalThis.DecompressionStream)
    throw Error(
      "Не удалось распаковать рыночный архив. Используйте актуальный браузер.",
    );
  const binary = atob(encoded.trim()),
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (sha !== part.sha256)
    throw Error("Контрольная сумма архива не совпадает. Повторите загрузку.");
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  if (new TextEncoder().encode(text).byteLength !== part.uncompressedBytes)
    throw Error("Размер рыночного архива не совпадает с индексом.");
  const rows = JSON.parse(text);
  if (
    !Array.isArray(rows) ||
    rows.length !== part.count ||
    rows[0]?.[0] !== part.firstTime ||
    rows.at(-1)?.[0] !== part.lastTime
  )
    throw Error("Рыночный архив не соответствует индексу.");
  let previous = 0;
  const bars = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 6 || row.length > 7)
      throw Error("Некорректная свеча архива.");
    const [time, open, high, low, close, volume, contract] = row;
    if (
      !Number.isSafeInteger(time) ||
      time % 60 ||
      time <= previous ||
      [open, high, low, close].some(
        (v) =>
          !Number.isFinite(v) ||
          v <= 0 ||
          Math.abs(v * 4 - Math.round(v * 4)) > 1e-7,
      ) ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high ||
      !Number.isFinite(volume) ||
      volume < 0
    )
      throw Error("Некорректная минутная свеча архива.");
    previous = time;
    return {
      time,
      open,
      high,
      low,
      close,
      volume,
      ...(contract ? { contract } : {}),
    };
  });
  return { symbol, bars, isDemo: false };
}
export async function readCuratedDataset(id: any, range?: any) {
  const archive = archives.get(id);
  if (archive)
    return range
      ? readArchive(archive, range.from, range.to, (partId: any) =>
          readCuratedDataset(partId),
        )
      : structuredClone(archive);
  const entry = parts.get(id);
  if (!entry) throw Error("Рыночный архив не найден.");
  const response = await fetch(
    "/api/market-data/" + entry.part.id + "?v=" + entry.part.sha256,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok)
    throw Error("Не удалось загрузить рыночные свечи. Повторите попытку.");
  return decodeCuratedPart(
    await response.text(),
    entry.part,
    entry.archive.symbol,
  );
}
