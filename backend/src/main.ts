import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { raw } from "express";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api");
  app.use(
    (
      request: import("express").Request,
      response: import("express").Response,
      next: import("express").NextFunction,
    ) => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      next();
    },
  );
  app.use(raw({ type: () => true, limit: "20mb" }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
if (require.main === module) {
  createApp()
    .then((app) =>
      app.listen(
        Number(process.env.API_PORT || 3001),
        process.env.API_HOST || "127.0.0.1",
      ),
    )
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
