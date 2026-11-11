import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { randomBytes, randomUUID } from "node:crypto";
import { fail } from "../../common/exceptions/api-error";
import { decrypt, encrypt, encryptionKey, hash, matches } from "./credentials";
import {
  identifier,
  object,
  projectTrades,
  text,
  validateSnapshot,
  type Snapshot,
} from "./ledger";

const SERVER = "FundingPips-SIM1";
const uuid = (value: string) => {
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value))
    fail(404, "NOT_FOUND", "MT5 account not found.");
  return value;
};
function input<T>(read: () => T): T {
  try {
    return read();
  } catch {
    return fail(
      400,
      "INVALID_MT5_INPUT",
      "Check the MT5 account details or import format.",
    );
  }
}
@Injectable()
export class Mt5Service {
  constructor(private readonly db: DataSource) {}
  private configured() {
    try {
      encryptionKey();
      return (process.env.MT5_WORKER_TOKEN || "").length >= 32;
    } catch {
      return false;
    }
  }
  worker(token: string | undefined) {
    const expected = process.env.MT5_WORKER_TOKEN || "";
    if (expected.length < 32 || !token || !matches(token, `Bearer ${expected}`))
      fail(401, "WORKER_AUTH_REQUIRED", "Worker authentication required.");
  }
  private async expire() {
    await this.db
      .query(`UPDATE mt5_jobs SET status='failed',error='SYNC_TIMEOUT',finished_at=now(),lease_hash=NULL
      WHERE (status='running' AND expires_at<now()) OR (status='queued' AND created_at<now()-interval '15 minutes')`);
  }
  async list(owner: string) {
    await this.expire();
    const [worker] = await this.db.query(
      `SELECT seen_at>now()-interval '45 seconds' AS online FROM mt5_worker WHERE id=true`,
    );
    const accounts = await this.db.query(
      `SELECT c.id,c.label,c.login,c.server,(c.secret IS NOT NULL OR c.local_token_hash IS NOT NULL) AS connected,c.last_sync AS "lastSync",
      c.sync_location AS "syncLocation",
      CASE WHEN c.sync_location='local' THEN COALESCE(c.local_seen_at>now()-interval '45 seconds',false)
      ELSE EXISTS(SELECT 1 FROM mt5_worker WHERE id=true AND seen_at>now()-interval '45 seconds') END AS "workerOnline",
      c.snapshot->'account'->>'currency' AS currency,
      (SELECT json_build_object('id',j.id,'status',j.status,'error',j.error) FROM mt5_jobs j WHERE j.connection_id=c.id ORDER BY created_at DESC LIMIT 1) AS job
      FROM mt5_connections c WHERE owner_id=$1 ORDER BY created_at`,
      [owner],
    );
    return {
      configured: this.configured(),
      workerOnline:
        !!worker?.online || accounts.some((a: any) => a.workerOnline),
      servers: [SERVER],
      accounts,
    };
  }
  async connect(owner: string, raw: unknown) {
    if (!this.configured())
      fail(
        503,
        "MT5_NOT_CONFIGURED",
        "MT5 sync is not enabled on this server yet.",
      );
    const v = input(() => {
      const b = object(raw),
        login = identifier(b.login),
        local = b.mode === "local",
        password = local ? "" : text(b.password, 256),
        label = text(b.label || "FundingPips", 80).trim();
      if (
        login === "0" ||
        (!local && !password) ||
        password.includes("\n") ||
        b.server !== SERVER ||
        !label
      )
        throw new Error();
      return { login, password, label, local };
    });
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `mt5:${owner}`,
      ]);
      const [existing] = await tx.query(
        "SELECT id FROM mt5_connections WHERE owner_id=$1 AND login=$2 AND server=$3 FOR UPDATE",
        [owner, v.login, SERVER],
      );
      const [{ count }] = await tx.query(
        "SELECT count(*)::int AS count FROM mt5_connections WHERE owner_id=$1",
        [owner],
      );
      if (!existing && count >= 5)
        fail(
          409,
          "MT5_ACCOUNT_LIMIT",
          "You can connect up to five MT5 accounts.",
        );
      if (existing)
        await tx.query(
          "UPDATE mt5_jobs SET status='cancelled',lease_hash=NULL,finished_at=now() WHERE connection_id=$1 AND status IN ('queued','running')",
          [existing.id],
        );
      const id = existing?.id || randomUUID();
      const secret = v.local
        ? null
        : encrypt(v.password, `${owner}:${id}:${v.login}:${SERVER}`);
      await tx.query(
        `INSERT INTO mt5_connections(id,owner_id,login,server,label,secret,sync_location) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(owner_id,login,server) DO UPDATE SET label=EXCLUDED.label,secret=EXCLUDED.secret,sync_location=EXCLUDED.sync_location,local_token_hash=NULL,local_seen_at=NULL`,
        [
          id,
          owner,
          v.login,
          SERVER,
          v.label,
          secret,
          v.local ? "local" : "server",
        ],
      );
      return { id };
    });
  }
  async disconnect(owner: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        "SELECT id FROM mt5_connections WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [owner, uuid(id)],
      );
      if (!c) fail(404, "NOT_FOUND", "MT5 account not found.");
      await tx.query(
        "UPDATE mt5_connections SET secret=NULL,local_token_hash=NULL,local_seen_at=NULL WHERE id=$1",
        [id],
      );
      await tx.query(
        "UPDATE mt5_jobs SET status='cancelled',lease_hash=NULL,finished_at=now() WHERE connection_id=$1 AND status IN ('queued','running')",
        [id],
      );
      return { disconnected: true };
    });
  }
  async sync(owner: string, id: string) {
    if (!this.configured())
      fail(
        503,
        "MT5_NOT_CONFIGURED",
        "MT5 sync is not enabled on this server yet.",
      );
    await this.expire();
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        "SELECT id,sync_location,local_seen_at>now()-interval '45 seconds' AS online,(secret IS NOT NULL OR local_token_hash IS NOT NULL) AS connected FROM mt5_connections WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [owner, uuid(id)],
      );
      if (!c) fail(404, "NOT_FOUND", "MT5 account not found.");
      if (!c.connected)
        fail(
          409,
          "MT5_DISCONNECTED",
          "Reconnect your Windows connector or investor password first.",
        );
      const [active] = await tx.query(
        "SELECT id,status FROM mt5_jobs WHERE connection_id=$1 AND status IN ('queued','running')",
        [id],
      );
      if (active) return active;
      const [worker] = await tx.query(
        "SELECT id FROM mt5_worker WHERE id=true AND seen_at>now()-interval '45 seconds'",
      );
      if (c.sync_location === "local" ? !c.online : !worker)
        fail(
          503,
          "MT5_WORKER_OFFLINE",
          c.sync_location === "local"
            ? "Run the connector on your Windows PC, then try again."
            : "The MT5 sync worker is offline. Try again once it is running.",
        );
      const [recent] = await tx.query(
        "SELECT id FROM mt5_jobs WHERE connection_id=$1 AND created_at>now()-interval '1 minute' LIMIT 1",
        [id],
      );
      if (recent)
        fail(
          429,
          "MT5_SYNC_RATE",
          "Please wait one minute before syncing again.",
        );
      const job = randomUUID();
      await tx.query(
        "INSERT INTO mt5_jobs(id,connection_id,status) VALUES($1,$2,'queued')",
        [job, id],
      );
      return { id: job, status: "queued" };
    });
  }
  async claim() {
    if (!this.configured())
      fail(503, "MT5_NOT_CONFIGURED", "MT5 sync is not configured.");
    await this.expire();
    await this.db.query(
      "INSERT INTO mt5_worker(id,seen_at) VALUES(true,now()) ON CONFLICT(id) DO UPDATE SET seen_at=now()",
    );
    return this.db.transaction(async (tx) => {
      // One terminal at a time across this deployment, including multiple worker replicas.
      await tx.query(
        "SELECT pg_advisory_xact_lock(hashtext('mt5-worker-claim'))",
      );
      const [busy] = await tx.query(
        "SELECT j.id FROM mt5_jobs j JOIN mt5_connections c ON c.id=j.connection_id WHERE j.status='running' AND c.sync_location='server' LIMIT 1",
      );
      if (busy) return { job: null };
      const [j] =
        await tx.query(`SELECT j.id,c.id AS connection_id,c.owner_id,c.login,c.server,c.secret
        FROM mt5_jobs j JOIN mt5_connections c ON c.id=j.connection_id WHERE j.status='queued' AND c.secret IS NOT NULL AND c.sync_location='server'
        ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j,c SKIP LOCKED`);
      if (!j) return { job: null };
      const lease = randomBytes(32).toString("base64url");
      let password: string;
      try {
        password = decrypt(
          j.secret,
          `${j.owner_id}:${j.connection_id}:${j.login}:${j.server}`,
        );
      } catch {
        await tx.query(
          "UPDATE mt5_jobs SET status='failed',error='CREDENTIALS_UNAVAILABLE',finished_at=now() WHERE id=$1",
          [j.id],
        );
        return { job: null };
      }
      await tx.query(
        "UPDATE mt5_jobs SET status='running',lease_hash=$2,expires_at=now()+interval '8 minutes' WHERE id=$1",
        [j.id, hash(lease)],
      );
      return {
        job: { id: j.id, lease, login: j.login, server: j.server, password },
      };
    });
  }
  async heartbeat() {
    await this.db.query(
      "INSERT INTO mt5_worker(id,seen_at) VALUES(true,now()) ON CONFLICT(id) DO UPDATE SET seen_at=now()",
    );
    return { alive: true };
  }
  async pairLocal(owner: string, id: string) {
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        "SELECT id,login,server FROM mt5_connections WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [owner, uuid(id)],
      );
      if (!c) fail(404, "NOT_FOUND", "MT5 account not found.");
      const key = randomBytes(32).toString("base64url");
      await tx.query(
        "UPDATE mt5_jobs SET status='cancelled',lease_hash=NULL,finished_at=now() WHERE connection_id=$1 AND status IN ('queued','running')",
        [id],
      );
      // Switching to local collection also removes the server's investor password.
      await tx.query(
        "UPDATE mt5_connections SET sync_location='local',secret=NULL,local_token_hash=$2,local_seen_at=NULL WHERE id=$1",
        [id, hash(key)],
      );
      return { token: `${id}.${key}`, login: c.login, server: c.server };
    });
  }
  private async localIdentity(authorization?: string) {
    const token = /^Bearer ([a-f\d-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(
      authorization || "",
    );
    if (!token)
      fail(
        401,
        "LOCAL_AUTH_REQUIRED",
        "Windows connector pairing is required.",
      );
    const [c] = await this.db.query(
      "SELECT id,local_token_hash FROM mt5_connections WHERE id=$1 AND sync_location='local'",
      [uuid(token[1])],
    );
    if (!c?.local_token_hash || !matches(hash(token[2]), c.local_token_hash))
      fail(
        401,
        "LOCAL_AUTH_REQUIRED",
        "Windows connector pairing has expired or was revoked.",
      );
    return { id: c.id as string, hash: c.local_token_hash as string };
  }
  async localHeartbeat(authorization?: string) {
    const c = await this.localIdentity(authorization);
    const [account] = await this.db.query(
      "WITH seen AS (UPDATE mt5_connections SET local_seen_at=now() WHERE id=$1 AND local_token_hash=$2 RETURNING login,server) SELECT login,server FROM seen",
      [c.id, c.hash],
    );
    if (!account)
      fail(401, "LOCAL_AUTH_REQUIRED", "Pair the Windows connector again.");
    return account;
  }
  async localClaim(authorization?: string) {
    const identity = await this.localIdentity(authorization);
    await this.expire();
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        "SELECT * FROM mt5_connections WHERE id=$1 AND local_token_hash=$2 AND sync_location='local' FOR UPDATE",
        [identity.id, identity.hash],
      );
      if (!c)
        fail(401, "LOCAL_AUTH_REQUIRED", "Pair the Windows connector again.");
      await tx.query(
        "UPDATE mt5_connections SET local_seen_at=now() WHERE id=$1",
        [c.id],
      );
      const [j] = await tx.query(
        "SELECT id FROM mt5_jobs WHERE connection_id=$1 AND status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE",
        [c.id],
      );
      if (!j) return { job: null };
      const lease = randomBytes(32).toString("base64url");
      await tx.query(
        "UPDATE mt5_jobs SET status='running',lease_hash=$2,expires_at=now()+interval '8 minutes' WHERE id=$1",
        [j.id, hash(lease)],
      );
      return { job: { id: j.id, lease, login: c.login, server: c.server } };
    });
  }
  async localFinish(
    authorization: string | undefined,
    id: string,
    raw: unknown,
  ) {
    const c = await this.localIdentity(authorization);
    return this.finish(id, raw, c.id);
  }
  async finish(id: string, raw: unknown, localScope?: string) {
    const body = input(() => object(raw));
    const lease = input(() => text(body.lease, 100));
    // Lock connection before job, matching disconnect/reconnect, to avoid deadlocks.
    return this.db.transaction(async (tx) => {
      const [identity] = await tx.query(
        "SELECT connection_id FROM mt5_jobs WHERE id=$1",
        [uuid(id)],
      );
      if (!identity) fail(404, "NOT_FOUND", "Sync job not found.");
      if (localScope && identity.connection_id !== localScope)
        fail(404, "NOT_FOUND", "Sync job not found.");
      const [c] = await tx.query(
        "SELECT * FROM mt5_connections WHERE id=$1 FOR UPDATE",
        [identity.connection_id],
      );
      const [j] = await tx.query(
        "SELECT * FROM mt5_jobs WHERE id=$1 AND status='running' AND expires_at>now() FOR UPDATE",
        [id],
      );
      const authorized = localScope
        ? c.sync_location === "local" && c.local_token_hash
        : c.sync_location === "server" && c.secret;
      if (!j || !authorized || !matches(hash(lease), j.lease_hash || ""))
        fail(409, "STALE_MT5_JOB", "Sync job has expired or was cancelled.");
      if (body.error !== undefined) {
        const known = [
          "LOGIN_FAILED",
          "READ_ONLY_REQUIRED",
          "ACCOUNT_MISMATCH",
          "HISTORY_FAILED",
          "HISTORY_TOO_LARGE",
          "TERMINAL_UNAVAILABLE",
          "COLLECTOR_FAILED",
        ];
        const error = known.includes(body.error)
          ? body.error
          : "COLLECTOR_FAILED";
        await tx.query(
          "UPDATE mt5_jobs SET status='failed',error=$2,finished_at=now(),lease_hash=NULL WHERE id=$1",
          [id, error],
        );
        return { imported: false };
      }
      const snapshot = input(() =>
        validateSnapshot(body.snapshot, c.login, c.server, !!localScope),
      );
      // Retain previously imported deals if a broker later shortens its history window.
      const history = new Map<string, Snapshot["deals"][number]>(
        (c.snapshot?.deals || []).map((d: Snapshot["deals"][number]) => [
          d.ticket,
          d,
        ]),
      );
      for (const d of snapshot.deals) history.set(d.ticket, d);
      if (history.size > 50000)
        fail(
          413,
          "MT5_HISTORY_LIMIT",
          "History exceeds the supported import size.",
        );
      snapshot.deals = [...history.values()];
      if (
        c.snapshot?.account?.currency &&
        c.snapshot.account.currency !== snapshot.account.currency
      )
        fail(
          409,
          "MT5_CURRENCY_CHANGED",
          "Account currency changed. Import requires review.",
        );
      await tx.query(
        "UPDATE mt5_connections SET snapshot=$2::jsonb,last_sync=now() WHERE id=$1",
        [c.id, JSON.stringify(snapshot)],
      );
      await tx.query(
        "UPDATE mt5_jobs SET status='succeeded',finished_at=now(),lease_hash=NULL WHERE id=$1",
        [id],
      );
      return { imported: true, deals: history.size };
    });
  }
  async journal(owner: string, id: string, page = 0, search = "") {
    const [c] = await this.db.query(
      "SELECT snapshot FROM mt5_connections WHERE owner_id=$1 AND id=$2",
      [owner, uuid(id)],
    );
    if (!c) fail(404, "NOT_FOUND", "MT5 account not found.");
    if (!c.snapshot)
      return {
        trades: [],
        positions: [],
        adjustments: [],
        total: 0,
        warnings: 0,
        currency: null,
        summary: { net: 0, closed: 0, wins: 0 },
      };
    const snapshot = c.snapshot as Snapshot;
    const { trades, warnings } = projectTrades(snapshot.deals);
    const notes = await this.db.query(
      'SELECT trade_id,note,tags,strategy,planned_risk AS "plannedRisk" FROM mt5_annotations WHERE connection_id=$1',
      [id],
    );
    const annotations = new Map<string, any>(
      notes.map((n: any) => [n.trade_id, n]),
    );
    const filter = search.trim().toLowerCase().slice(0, 100);
    const all = trades.map((t) => ({
      ...t,
      annotation: annotations.get(t.id) || {
        note: "",
        tags: [],
        strategy: "",
        plannedRisk: null,
      },
    }));
    const selected = all.filter((t) =>
      [
        t.symbol,
        t.side,
        t.annotation.note,
        t.annotation.strategy,
        ...t.annotation.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(filter),
    );
    const closed = all.filter((t) => t.closedAt !== null);
    return {
      trades: selected.slice(page * 100, page * 100 + 100),
      total: selected.length,
      positions: snapshot.positions,
      adjustments: snapshot.deals.filter((d) => d.type > 1),
      warnings,
      currency: snapshot.account.currency,
      summary: {
        net: closed.reduce((s, t) => s + t.net, 0),
        closed: closed.length,
        wins: closed.filter((t) => t.net > 0).length,
      },
    };
  }
  async annotate(owner: string, id: string, tradeId: string, raw: unknown) {
    const annotation = input(() => {
      const b = object(raw),
        strategy = text(b.strategy, 100),
        risk = b.plannedRisk;
      if (
        typeof b.note !== "string" ||
        b.note.length > 10000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(b.note)
      )
        throw new Error();
      const note = b.note as string;
      if (
        !Array.isArray(b.tags) ||
        b.tags.length > 20 ||
        (risk !== null &&
          (typeof risk !== "number" ||
            !Number.isFinite(risk) ||
            risk <= 0 ||
            risk > 1e12))
      )
        throw new Error();
      return {
        note,
        strategy,
        tags: [
          ...new Set(
            b.tags.map((tag: unknown) => text(tag, 50).trim()).filter(Boolean),
          ),
        ],
        risk,
      };
    });
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        "SELECT snapshot FROM mt5_connections WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [owner, uuid(id)],
      );
      if (
        !c?.snapshot ||
        !projectTrades(c.snapshot.deals).trades.some((t) => t.id === tradeId)
      )
        fail(404, "NOT_FOUND", "Trade not found.");
      await tx.query(
        `INSERT INTO mt5_annotations(connection_id,trade_id,note,tags,strategy,planned_risk) VALUES($1,$2,$3,$4::jsonb,$5,$6)
        ON CONFLICT(connection_id,trade_id) DO UPDATE SET note=EXCLUDED.note,tags=EXCLUDED.tags,strategy=EXCLUDED.strategy,planned_risk=EXCLUDED.planned_risk`,
        [
          id,
          tradeId,
          annotation.note,
          JSON.stringify(annotation.tags),
          annotation.strategy,
          annotation.risk,
        ],
      );
      return { saved: true };
    });
  }
}
