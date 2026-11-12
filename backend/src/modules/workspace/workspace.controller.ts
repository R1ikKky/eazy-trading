import { Controller, Get, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readJson } from "../../common/http/request-body";
import { userId } from "../auth/auth.utils";
import { WorkspaceService } from "./workspace.service";
@Controller()
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}
  @Get("workspace") async getWorkspace(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const raw = request.query.revision;
    const known =
      typeof raw === "string" &&
      /^(0|[1-9]\d*)$/.test(raw) &&
      Number.isSafeInteger(Number(raw))
        ? Number(raw)
        : undefined;
    const value = await this.workspace.get(userId(request), known);
    response.setHeader("Cache-Control", "no-store");
    if (value === null) {
      response.status(204);
      return;
    }
    return value;
  }
  @Put("workspace") putWorkspace(@Req() request: Request) {
    return this.workspace.put(
      userId(request),
      readJson(request, 5 * 1024 * 1024),
    );
  }
}
