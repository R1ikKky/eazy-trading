import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { fail } from "../exceptions/api-error";

@Injectable()
export class LocalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:3000";
    const callback =
      request.method === "GET" &&
      /^\/api\/auth\/(google|github)\/callback$/.test(request.path);
    if (
      !callback &&
      (request.headers["sec-fetch-site"] === "cross-site" ||
        (request.headers.origin && request.headers.origin !== origin))
    ) {
      fail(
        403,
        "SAME_ORIGIN_REQUIRED",
        "Доступ разрешён только с этого сайта.",
      );
    }
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.origin !== origin
    ) {
      fail(
        403,
        "SAME_ORIGIN_REQUIRED",
        "Сохранение разрешено только с этого сайта.",
      );
    }
    // Prevent browser DNS rebinding when the API is run directly on loopback.
    const allowedHosts = [
      new URL(origin).host,
      `127.0.0.1:${process.env.API_PORT || 3001}`,
      `localhost:${process.env.API_PORT || 3001}`,
      `api:${process.env.API_PORT || 3001}`,
    ];
    if (!allowedHosts.includes(request.headers.host || ""))
      fail(403, "INVALID_HOST", "Недопустимый адрес сервера.");
    return true;
  }
}
