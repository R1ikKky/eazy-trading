import { HttpException } from "@nestjs/common";
export function fail(
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
): never {
  throw new HttpException({ error, message, ...extra }, status);
}
