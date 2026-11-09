import { validateTrade } from "@eazy-trading/orderflow";
import { fail } from "../../../common/exceptions/api-error";
import { object, validId } from "../../../common/validation/json";
import type { DatasetInput } from "../dto/create-dataset.dto";
function textField(
  value: unknown,
  max: number,
  name: string,
  required = true,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(400, "INVALID_DATASET", "Неверное поле данных: " + name + ".");
  return value;
}
export function validateDataset(input: unknown): DatasetInput {
  if (
    !object(input) ||
    !validId(input.id) ||
    !["NQ", "ES"].includes(input.symbol)
  )
    fail(
      400,
      "INVALID_DATASET",
      "Укажите корректный id и инструмент NQ или ES.",
    );
  const name = textField(input.name, 180, "name");
  const source = textField(input.source, 600, "source");
  if (input.metadata !== undefined && !object(input.metadata))
    fail(400, "INVALID_DATASET", "Метаданные должны быть объектом.");
  if (
    !Array.isArray(input.bars) ||
    !input.bars.length ||
    input.bars.length > 150000
  )
    fail(400, "INVALID_DATASET", "Нужно от 1 до 150 000 минутных свечей.");
  if (input.metadata?.tradeEvents !== undefined) {
    if (
      !Array.isArray(input.metadata.tradeEvents) ||
      input.metadata.tradeEvents.length > 100000
    )
      fail(400, "INVALID_TRADES", "Maximum 100,000 trade events");
    try {
      input.metadata.tradeEvents = input.metadata.tradeEvents.map(
        (t: unknown) => {
          const trade = validateTrade(t);
          if (trade.instrument !== input.symbol) throw Error();
          return trade;
        },
      );
    } catch {
      fail(400, "INVALID_TRADES", "Invalid trade event or instrument");
    }
  }
  let previous = -1;
  for (let i = 0; i < input.bars.length; i++) {
    const bar = input.bars[i];
    if (
      !object(bar) ||
      !Number.isSafeInteger(bar.time) ||
      bar.time < 0 ||
      bar.time % 60 !== 0 ||
      bar.time <= previous ||
      bar.time > 4102444800
    )
      fail(
        400,
        "INVALID_BARS",
        "Время свечей должно возрастать и соответствовать началу минуты.",
        { bar: i },
      );
    for (const field of ["open", "high", "low", "close"]) {
      const price = bar[field];
      if (
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        price > 100000000 ||
        Math.abs(price * 4 - Math.round(price * 4)) > 0.0000001
      )
        fail(
          400,
          "INVALID_BARS",
          "Цены NQ/ES должны быть положительными с шагом 0.25.",
          { bar: i, field },
        );
    }
    if (
      bar.high < Math.max(bar.open, bar.close) ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.low > bar.high
    )
      fail(400, "INVALID_BARS", "Нарушена структура OHLC свечи.", { bar: i });
    if (
      typeof bar.volume !== "number" ||
      !Number.isFinite(bar.volume) ||
      bar.volume < 0
    )
      fail(400, "INVALID_BARS", "Объём должен быть неотрицательным числом.", {
        bar: i,
      });
    if (
      bar.contract !== undefined &&
      (typeof bar.contract !== "string" ||
        !/^[A-Z0-9!._:-]{1,32}$/.test(bar.contract))
    )
      fail(400, "INVALID_BARS", "Неверный код фьючерсного контракта.", {
        bar: i,
      });
    // Store a canonical candle, excluding arbitrary large unrecognized fields.
    input.bars[i] = {
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      ...(bar.contract ? { contract: bar.contract } : {}),
    };
    previous = bar.time;
  }
  return {
    id: input.id,
    symbol: input.symbol,
    name,
    source,
    metadata: input.metadata || {},
    bars: input.bars,
  };
}
