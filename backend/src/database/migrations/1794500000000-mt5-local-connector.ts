import type { MigrationInterface, QueryRunner } from "typeorm";
export class Mt5LocalConnector1794500000000 implements MigrationInterface {
  async up(r: QueryRunner) {
    await r.query(`ALTER TABLE mt5_connections
      ADD COLUMN sync_location text NOT NULL DEFAULT 'server' CHECK(sync_location IN ('server','local')),
      ADD COLUMN local_token_hash text,
      ADD COLUMN local_seen_at timestamptz`);
  }
  async down(r: QueryRunner) {
    await r.query(
      "ALTER TABLE mt5_connections DROP COLUMN local_seen_at,DROP COLUMN local_token_hash,DROP COLUMN sync_location",
    );
  }
}
