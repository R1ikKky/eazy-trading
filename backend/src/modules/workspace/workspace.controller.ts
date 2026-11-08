import { Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { readJson } from "../../common/http/request-body";
import { userId } from "../auth/auth.utils";
import { WorkspaceService } from "./workspace.service";
@Controller()
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}
  @Get("workspace") getWorkspace(@Req() request: Request) {
    return this.workspace.get(userId(request));
  }
  @Put("workspace") putWorkspace(@Req() request: Request) {
    return this.workspace.put(
      userId(request),
      readJson(request, 5 * 1024 * 1024),
    );
  }
}
