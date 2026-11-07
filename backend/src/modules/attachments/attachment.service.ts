import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { Attachment } from "./entities/attachment.entity";
import { fail } from "../../common/exceptions/api-error";

@Injectable()
export class AttachmentService {
  constructor(private readonly db: DataSource) {}
  async post(
    ownerId: string,
    content: Buffer,
    type: string,
    originalName: string,
  ) {
    const actual = content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : content.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? "image/jpeg"
        : content.length >= 12 &&
            content.toString("ascii", 0, 4) === "RIFF" &&
            content.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
    if (!["image/png", "image/jpeg", "image/webp"].includes(type))
      fail(415, "IMAGE_REQUIRED", "Поддерживаются PNG, JPEG и WebP.");
    if (actual !== type)
      fail(
        400,
        "INVALID_IMAGE",
        "Содержимое не соответствует формату изображения.",
      );
    let name = originalName;
    try {
      name = decodeURIComponent(name);
    } catch {}
    name =
      name
        .replace(/[\\/]/g, "_")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 120) || "Screenshot";
    const id = randomUUID();
    await this.db
      .getRepository(Attachment)
      .insert({ ownerId, id, name, contentType: type, content });
    return { id, url: "/api/attachments/" + id, name };
  }
  async get(ownerId: string, id: string) {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id))
      fail(404, "NOT_FOUND", "Изображение не найдено.");
    const row = await this.db
      .getRepository(Attachment)
      .findOneBy({ ownerId, id });
    if (!row) fail(404, "NOT_FOUND", "Изображение не найдено.");
    return row;
  }
}
