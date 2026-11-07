import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PROJECT_ROOT } from "../../config/environment";
import { createHash } from "node:crypto";
import { fail } from "../../common/exceptions/api-error";
interface Part {
  id: string;
  sha256: string;
  packedBytes: number;
  count: number;
}
@Injectable()
export class MarketDataService {
  private catalog?: Promise<Map<string, Part>>;
  private parts() {
    return (this.catalog ??= readFile(
      resolve(
        PROJECT_ROOT,
        process.env.MARKET_CATALOG || "data/market-archives.json",
      ),
      "utf8",
    ).then((text) => {
      const archives = JSON.parse(text) as { parts: Part[] }[];
      return new Map(
        archives.flatMap((a) => a.parts.map((p) => [p.id, p] as const)),
      );
    }));
  }
  async get(id: string, version?: string) {
    const part = (await this.parts()).get(id);
    if (!part || (version && version !== part.sha256))
      fail(404, "NOT_FOUND", "Версия архива не найдена.");
    const body = await readFile(
      resolve(
        PROJECT_ROOT,
        process.env.MARKET_ARCHIVES_DIR || "market-archives",
        part.id + ".b64",
      ),
    );
    const packed = Buffer.from(body.toString(), "base64");
    if (
      packed.length !== part.packedBytes ||
      createHash("sha256").update(packed).digest("hex") !== part.sha256
    )
      fail(
        503,
        "MARKET_DATA_CHECKSUM_MISMATCH",
        "Контрольная сумма архива не совпадает.",
      );
    return { body, part };
  }
  async verify(id: string, body: Buffer) {
    const { part } = await this.get(id);
    if (body.length !== Math.ceil(part.packedBytes / 3) * 4)
      fail(400, "MARKET_DATA_SIZE_MISMATCH", "Размер архива не совпадает.");
    const text = body.toString("utf8");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text))
      fail(400, "INVALID_MARKET_DATA", "Некорректный архив.");
    const packed = Buffer.from(text, "base64");
    if (
      packed.length !== part.packedBytes ||
      createHash("sha256").update(packed).digest("hex") !== part.sha256
    )
      fail(
        400,
        "MARKET_DATA_CHECKSUM_MISMATCH",
        "Контрольная сумма не совпадает.",
      );
    return {
      ok: true,
      id,
      sha256: part.sha256,
      count: part.count,
      existing: true,
    };
  }
}
