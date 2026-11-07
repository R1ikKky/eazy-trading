import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
    } else if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json({
        error: "BODY_TOO_LARGE",
        message: "Превышен допустимый размер.",
      });
    } else {
      this.logger.error(
        error instanceof Error ? error.message : "Storage failure",
      );
      response.status(503).json({
        error: "STORAGE_ERROR",
        message: "Сохранение временно недоступно. Повторите попытку позже.",
      });
    }
  }
}
