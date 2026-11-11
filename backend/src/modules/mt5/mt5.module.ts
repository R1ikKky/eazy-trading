import {
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { userId } from "../auth/auth.utils";
import { Public } from "../auth/public.decorator";
import { readJson } from "../../common/http/request-body";
import { Mt5Service } from "./mt5.service";
@Controller("mt5")
export class Mt5Controller {
  constructor(private readonly service: Mt5Service) {}
  @Get("connections") list(@Req() r: Request) {
    return this.service.list(userId(r));
  }
  @Post("connections") connect(@Req() r: Request) {
    return this.service.connect(userId(r), readJson(r, 4096));
  }
  @Delete("connections/:id") disconnect(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.service.disconnect(userId(r), id);
  }
  @Post("connections/:id/sync") sync(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    return this.service.sync(userId(r), id);
  }
  @Get("connections/:id/journal") journal(
    @Req() r: Request,
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("search") search?: string,
  ) {
    const p = Number(page || 0);
    return this.service.journal(
      userId(r),
      id,
      Number.isSafeInteger(p) && p >= 0 && p <= 500 ? p : 0,
      typeof search === "string" ? search : "",
    );
  }
  @Patch("connections/:id/trades/:tradeId") annotate(
    @Req() r: Request,
    @Param("id") id: string,
    @Param("tradeId") tradeId: string,
  ) {
    return this.service.annotate(userId(r), id, tradeId, readJson(r, 65536));
  }
  @Public() @Post("worker/claim") claim(@Req() r: Request) {
    this.service.worker(r.headers.authorization);
    return this.service.claim();
  }
  @Public() @Post("worker/heartbeat") heartbeat(@Req() r: Request) {
    this.service.worker(r.headers.authorization);
    return this.service.heartbeat();
  }
  @Public() @Post("worker/jobs/:id/finish") finish(
    @Req() r: Request,
    @Param("id") id: string,
  ) {
    this.service.worker(r.headers.authorization);
    return this.service.finish(id, readJson(r, 18 * 1024 * 1024));
  }
}
@Module({ controllers: [Mt5Controller], providers: [Mt5Service] })
export class Mt5Module {}
