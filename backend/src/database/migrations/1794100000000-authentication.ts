import { MigrationInterface, QueryRunner } from "typeorm";
export class Authentication1794100000000 implements MigrationInterface {
  async up(r: QueryRunner) {
    await r.query(
      `CREATE TABLE auth_users (id uuid PRIMARY KEY, username text UNIQUE, email text UNIQUE, "displayName" text NOT NULL, "passwordHash" text, "emailVerified" boolean NOT NULL DEFAULT false)`,
    );
    await r.query(
      `CREATE TABLE auth_sessions (id uuid PRIMARY KEY, "userId" uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, "expiresAt" timestamptz NOT NULL, "revokedAt" timestamptz)`,
    );
    await r.query(`CREATE INDEX auth_sessions_user ON auth_sessions("userId")`);
    await r.query(
      `CREATE TABLE auth_refresh_tokens (hash text PRIMARY KEY, "sessionId" uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE, "usedAt" timestamptz)`,
    );
    await r.query(
      `CREATE INDEX auth_refresh_session ON auth_refresh_tokens("sessionId")`,
    );
    await r.query(
      `CREATE TABLE auth_oauth_accounts (provider text NOT NULL, subject text NOT NULL, "userId" uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE, PRIMARY KEY(provider,subject))`,
    );
    await r.query(
      `CREATE TABLE auth_oauth_states (hash text PRIMARY KEY, provider text NOT NULL, verifier text NOT NULL, "browserHash" text NOT NULL, "expiresAt" timestamptz NOT NULL)`,
    );
    await r.query(
      `CREATE TABLE auth_rate_limits (key text PRIMARY KEY,count integer NOT NULL,expires timestamptz NOT NULL)`,
    );
    await r.query(
      `CREATE TABLE auth_secrets (id text PRIMARY KEY, value text NOT NULL)`,
    );
  }
  async down(r: QueryRunner) {
    await r.query(
      "DROP TABLE auth_rate_limits,auth_oauth_states,auth_oauth_accounts,auth_refresh_tokens,auth_sessions,auth_users,auth_secrets",
    );
  }
}
