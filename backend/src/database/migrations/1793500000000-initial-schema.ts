import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1793500000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE workspaces (
      "ownerId" text PRIMARY KEY, revision integer NOT NULL CHECK (revision >= 0),
      payload jsonb NOT NULL, "updatedAt" bigint NOT NULL
    )`);
    await runner.query(`CREATE TABLE datasets (
      "ownerId" text NOT NULL, id text NOT NULL, sha256 text NOT NULL,
      symbol text NOT NULL CHECK (symbol IN ('NQ','ES')), name text NOT NULL,
      count integer NOT NULL CHECK (count > 0), payload jsonb NOT NULL,
      PRIMARY KEY ("ownerId", id)
    )`);
    await runner.query(`CREATE TABLE attachments (
      "ownerId" text NOT NULL, id uuid NOT NULL, name text NOT NULL,
      "contentType" text NOT NULL, content bytea NOT NULL,
      PRIMARY KEY ("ownerId", id)
    )`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE attachments, datasets, workspaces");
  }
}
