import { Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { readJson } from "../../common/http/request-body";
import { OWNER } from "../../common/guards/local.guard";
import { WorkspaceService } from "./workspace.service";
@Controller()
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}
  @Get("workspace") getWorkspace() {
    return this.workspace.get(OWNER);
  }
  @Put("workspace") putWorkspace(@Req() request: Request) {
    return this.workspace.put(OWNER, readJson(request, 5 * 1024 * 1024));
  }
}
