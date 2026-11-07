import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readBody } from "../../common/http/request-body";
import { fail } from "../../common/exceptions/api-error";
import { MarketDataService } from "./market-data.service";
@Controller()
export class MarketDataController {
  constructor(private readonly market: MarketDataService) {}
  @Get("market-data/:id") async getMarket(
    @Param("id") id: string,
    @Query("v") version: string | undefined,
    @Res() response: Response,
  ) {
    const { body: content, part } = await this.market.get(id, version);
    response
      .set({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=86400, immutable",
        ETag: '"' + part.sha256 + '"',
      })
      .send(content);
  }
  @Post("market-data/:id") @HttpCode(200) postMarket(
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    if (!/^text\/plain(?:;|$)/i.test(request.headers["content-type"] || ""))
      fail(415, "TEXT_REQUIRED", "Нужен упакованный текст архива.");
    return this.market.verify(id, readBody(request, 8 * 1024 * 1024));
  }
}
