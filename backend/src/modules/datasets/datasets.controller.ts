import { Controller, Get, Post, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readJson } from "../../common/http/request-body";
import { OWNER } from "../../common/guards/local.guard";
import { DatasetService } from "./dataset.service";
@Controller()
export class DatasetController {
  constructor(private readonly datasets: DatasetService) {}
  @Post("datasets") async postDataset(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.datasets.post(
      OWNER,
      readJson(request, 20 * 1024 * 1024),
    );
    response.status(result.existing ? 200 : 201);
    return result;
  }
  @Get("datasets/:id") getDataset(@Param("id") id: string) {
    return this.datasets.get(OWNER, id);
  }
  @Post("archives") postArchive(@Req() request: Request) {
    return this.datasets.archive(OWNER, readJson(request, 128 * 1024));
  }
}
