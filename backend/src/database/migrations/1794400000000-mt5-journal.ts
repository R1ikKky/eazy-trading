import type { MigrationInterface, QueryRunner } from "typeorm";
export class Mt5Journal1794400000000 implements MigrationInterface {
  async up(r: QueryRunner) {
    await r.query(`CREATE TABLE mt5_connections (
      id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      login text NOT NULL, server text NOT NULL, label text NOT NULL, secret text,
      snapshot jsonb, last_sync timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(owner_id,login,server))`);
    await r.query(`CREATE TABLE mt5_jobs (
      id uuid PRIMARY KEY, connection_id uuid NOT NULL REFERENCES mt5_connections(id) ON DELETE CASCADE,
      status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
      lease_hash text, expires_at timestamptz, error text,
      created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz)`);
    await r.query(
      `CREATE UNIQUE INDEX mt5_one_active_job ON mt5_jobs(connection_id) WHERE status IN ('queued','running')`,
    );
    await r.query(
      `CREATE INDEX mt5_job_queue ON mt5_jobs(created_at) WHERE status='queued'`,
    );
    await r.query(
      `CREATE TABLE mt5_worker (id boolean PRIMARY KEY DEFAULT true CHECK(id), seen_at timestamptz NOT NULL)`,
    );
    await r.query(`CREATE TABLE mt5_annotations (
      connection_id uuid NOT NULL REFERENCES mt5_connections(id) ON DELETE CASCADE,
      trade_id text NOT NULL, note text NOT NULL DEFAULT '', tags jsonb NOT NULL DEFAULT '[]',
      strategy text NOT NULL DEFAULT '', planned_risk double precision,
      PRIMARY KEY(connection_id,trade_id))`);
  }
  async down(r: QueryRunner) {
    await r.query(
      "DROP TABLE mt5_annotations, mt5_worker, mt5_jobs, mt5_connections",
    );
  }
}
