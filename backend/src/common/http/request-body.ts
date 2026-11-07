import type { Request } from "express";
import { fail } from "../exceptions/api-error";
export function readBody(request: Request, limit: number): Buffer {
  const value: unknown = request.body;
  if (!Buffer.isBuffer(value) || !value.length)
    fail(400, "EMPTY_BODY", "Тело запроса отсутствует.");
  if (value.length > limit)
    fail(413, "BODY_TOO_LARGE", "Превышен допустимый размер.");
  return value;
}
export function readJson(request: Request, limit: number): unknown {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
    fail(415, "JSON_REQUIRED", "Отправьте application/json.");
  const content = readBody(request, limit);
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(content),
    );
  } catch {
    fail(400, "INVALID_JSON", "Не удалось прочитать JSON.");
  }
}
