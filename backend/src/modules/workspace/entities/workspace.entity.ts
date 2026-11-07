import { Column, Entity, PrimaryColumn } from "typeorm";
import type { WorkspacePayload } from "../dto/workspace.dto";
@Entity("workspaces")
export class Workspace {
  @PrimaryColumn("text") ownerId!: string;
  @Column("integer") revision!: number;
  @Column("jsonb") payload!: WorkspacePayload;
  @Column("bigint") updatedAt!: string;
}
