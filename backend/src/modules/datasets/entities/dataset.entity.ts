import { Column, Entity, PrimaryColumn } from "typeorm";
@Entity("datasets")
export class Dataset {
  @PrimaryColumn("text") ownerId!: string;
  @PrimaryColumn("text") id!: string;
  @Column("text") sha256!: string;
  @Column("text") symbol!: string;
  @Column("text") name!: string;
  @Column("integer") count!: number;
  @Column("jsonb") payload!: Record<string, unknown>;
}
