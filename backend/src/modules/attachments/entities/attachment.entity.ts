import { Column, Entity, PrimaryColumn } from "typeorm";
@Entity("attachments")
export class Attachment {
  @PrimaryColumn("text") ownerId!: string;
  @PrimaryColumn("uuid") id!: string;
  @Column("text") name!: string;
  @Column("text") contentType!: string;
  @Column("bytea") content!: Buffer;
}
