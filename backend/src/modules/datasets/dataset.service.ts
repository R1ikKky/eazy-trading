import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createHash } from "node:crypto";
import { Dataset } from "./entities/dataset.entity";
import { fail } from "../../common/exceptions/api-error";
import { object, validId } from "../../common/validation/json";
import { validateDataset } from "./validation/dataset.validation";

@Injectable()
export class DatasetService {
  constructor(private readonly db: DataSource) {}
  async get(ownerId: string, id: string) {
    if (!validId(id)) fail(404, "NOT_FOUND", "Данные не найдены.");
    const row = await this.db.getRepository(Dataset).findOneBy({ ownerId, id });
    if (!row) fail(404, "NOT_FOUND", "Данные не найдены.");
    return row.payload;
  }
  private async insert(
    ownerId: string,
    payload: Record<string, unknown>,
    count: number,
    allowIdentical: boolean,
  ) {
    const sha256 = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    return this.db.transaction(async (manager) => {
      const repository = manager.getRepository(Dataset);
      const id = payload.id as string;
      const result = await repository
        .createQueryBuilder()
        .insert()
        .values({
          ownerId,
          id,
          sha256,
          symbol: payload.symbol as string,
          name: payload.name as string,
          count,
          payload: () => ":payload",
        })
        .setParameter("payload", JSON.stringify(payload))
        .orIgnore()
        .returning("id")
        .execute();
      if (!result.raw.length) {
        const saved = await repository.findOneByOrFail({ ownerId, id });
        if (!allowIdentical || saved.sha256 !== sha256)
          fail(
            409,
            "DATASET_ID_CONFLICT",
            "Этот ID уже принадлежит другому набору данных.",
          );
      }
      return {
        id,
        symbol: payload.symbol,
        count,
        sha256,
        existing: !result.raw.length,
      };
    });
  }
  async post(ownerId: string, input: unknown) {
    const data = validateDataset(input);
    return this.insert(ownerId, data, data.bars.length, true);
  }
  async archive(ownerId: string, input: unknown) {
    if (
      !object(input) ||
      !validId(input.id) ||
      !["NQ", "ES"].includes(input.symbol) ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 180 ||
      !Array.isArray(input.parts) ||
      !input.parts.length ||
      input.parts.length > 72
    )
      fail(400, "INVALID_ARCHIVE", "Нужен архив NQ/ES из 1–72 частей.");
    const parts: {
      id: string;
      count: number;
      firstTime: number;
      lastTime: number;
      month: string;
    }[] = [];
    const seen = new Set<string>();
    let previous = 0,
      count = 0;
    const monthAt = (time: number) =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
      }).format(new Date(time * 1000));
    for (const ref of input.parts) {
      if (!object(ref) || !validId(ref.id) || seen.has(ref.id))
        fail(400, "INVALID_ARCHIVE", "Неверная или повторяющаяся часть.");
      seen.add(ref.id);
      const row = await this.db
        .getRepository(Dataset)
        .findOneBy({ ownerId, id: ref.id });
      if (
        !row ||
        row.symbol !== input.symbol ||
        !Array.isArray(row.payload.bars)
      )
        fail(
          400,
          "INVALID_ARCHIVE",
          "Часть недоступна или относится к другому инструменту.",
        );
      const bars = row.payload.bars as { time: number }[];
      const firstTime = bars[0].time,
        lastTime = bars[bars.length - 1].time,
        month = monthAt(firstTime);
      if (firstTime <= previous || month !== monthAt(lastTime))
        fail(
          400,
          "INVALID_ARCHIVE",
          "Части должны идти по времени без пересечения и по месяцам Нью-Йорка.",
        );
      previous = lastTime;
      count += row.count;
      if (count > 3000000)
        fail(400, "INVALID_ARCHIVE", "Максимум 3 000 000 свечей.");
      parts.push({ id: ref.id, count: row.count, firstTime, lastTime, month });
    }
    const payload = {
      id: input.id,
      kind: "archive",
      symbol: input.symbol,
      name: input.name,
      source: "user_csv",
      count,
      firstTime: parts[0].firstTime,
      lastTime: parts.at(-1)!.lastTime,
      parts,
      months: [...new Set(parts.map((p) => p.month))],
      metadata: {
        importedAt: new Date().toISOString(),
        contractColumn: !!input.hasContracts,
      },
    };
    await this.insert(ownerId, payload, count, false);
    return payload;
  }
}
