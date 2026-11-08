import { Controller, Get, Post, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { readBody } from "../../common/http/request-body";
import { userId } from "../auth/auth.utils";
import { AttachmentService } from "./attachment.service";
@Controller()
export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}
  @Post("attachments") postAttachment(@Req() request: Request) {
    return this.attachments.post(
      userId(request),
      readBody(request, 5 * 1024 * 1024),
      (request.headers["content-type"] || "").split(";")[0].toLowerCase(),
      String(request.headers["x-filename"] || "Screenshot"),
    );
  }
  @Get("attachments/:id") async getAttachment(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const row = await this.attachments.get(userId(request), id);
    response.setHeader("Content-Type", row.contentType);
    response.setHeader(
      "Content-Disposition",
      "inline; filename*=UTF-8''" + encodeURIComponent(row.name),
    );
    response.send(row.content);
  }
}
