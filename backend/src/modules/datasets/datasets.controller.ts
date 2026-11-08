import { Controller, Get, Post, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readJson } from "../../common/http/request-body";
import { userId } from "../auth/auth.utils";
import { DatasetService } from "./dataset.service";
@Controller()
export class DatasetController {
  constructor(private readonly datasets: DatasetService) {}
  @Post("datasets") async postDataset(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.datasets.post(
      userId(request),
      readJson(request, 20 * 1024 * 1024),
    );
    response.status(result.existing ? 200 : 201);
    return result;
  }
  @Get("datasets/:id") getDataset(
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    return this.datasets.get(userId(request), id);
  }
  @Post("archives") postArchive(@Req() request: Request) {
    return this.datasets.archive(
      userId(request),
      readJson(request, 128 * 1024),
    );
  }
}
