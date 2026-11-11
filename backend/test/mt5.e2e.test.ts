import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
test("MT5: encrypted storage, authenticated leases, isolated owners, idempotent import, annotations and disconnect", async () => {
  assert.ok(process.env.DATABASE_URL);
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  const name = "mt5_test_" + randomUUID().replaceAll("-", "");
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + name;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    PUBLIC_ORIGIN: "http://127.0.0.1:3100",
    AUTH_JWT_SECRET: "synthetic-test-secret-".repeat(5),
    AUTH_REGISTRATION_ENABLED: "true",
    AUTH_OWNER_EMAIL: "",
    AUTH_BOOTSTRAP_PASSWORD: "",
    AUTH_ALLOWED_EMAILS: "",
    MT5_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString("base64"),
    MT5_WORKER_TOKEN: "synthetic-worker-token-".repeat(3),
    ORDERFLOW_FEED: "disabled",
  });
  const require = createRequire(import.meta.url);
  const { createApp } = require("../dist/main.js");
  const { DataSource } = require("typeorm");
  let app: any;
  try {
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    process.env.API_PORT = String(app.getHttpServer().address().port);
    const db = app.get(DataSource);
    const call = (
      path: string,
      method = "GET",
      body?: unknown,
      jar = "",
      headers = {},
    ) =>
      fetch(`http://127.0.0.1:${process.env.API_PORT}/api/${path}`, {
        method,
        headers: {
          origin: process.env.PUBLIC_ORIGIN!,
          "content-type": "application/json",
          cookie: jar,
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const register = async (username: string) => {
      const r = await call("auth/register", "POST", {
        username,
        email: username + "@example.test",
        password: "Synthetic-test-password-2026",
      });
      assert.equal(r.status, 201, await r.clone().text());
      return r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
    };
    const alice = await register("mt5alice"),
      bob = await register("mt5bob");
    const worker = { authorization: `Bearer ${process.env.MT5_WORKER_TOKEN}` };
    assert.equal((await call("mt5/connections")).status, 401);
    assert.equal(
      (await call("mt5/worker/claim", "POST", {}, alice)).status,
      401,
      "User cookies do not grant worker privileges",
    );
    assert.equal(
      (
        await call("mt5/worker/claim", "POST", {}, "", {
          ...worker,
          origin: "https://evil.test",
        })
      ).status,
      403,
    );
    const conn = await call(
      "mt5/connections",
      "POST",
      {
        login: "12345678",
        server: "FundingPips-SIM1",
        label: "Synthetic account",
        password: "synthetic-investor-password",
      },
      alice,
    );
    assert.equal(conn.status, 201);
    const { id } = (await conn.json()) as any;
    const [saved] = await db.query(
      "SELECT secret FROM mt5_connections WHERE id=$1",
      [id],
    );
    assert.ok(
      saved.secret && !saved.secret.includes("synthetic-investor-password"),
    );
    assert.equal(
      (await call(`mt5/connections/${id}/journal`, "GET", undefined, bob))
        .status,
      404,
    );
    assert.equal(
      (await call(`mt5/connections/${id}/sync`, "POST", {}, bob)).status,
      404,
    );
    assert.equal(
      (await call(`mt5/connections/${id}/sync`, "POST", {}, alice)).status,
      503,
      "Offline workers do not pretend to queue successfully",
    );
    await call("mt5/worker/heartbeat", "POST", {}, "", worker);
    const queued = await call(`mt5/connections/${id}/sync`, "POST", {}, alice);
    assert.equal(queued.status, 201);
    assert.equal(
      (
        (await (
          await call(`mt5/connections/${id}/sync`, "POST", {}, alice)
        ).json()) as any
      ).id,
      ((await queued.json()) as any).id,
    );
    const claim = await call("mt5/worker/claim", "POST", {}, "", worker);
    const { job } = (await claim.json()) as any;
    assert.equal(job.password, "synthetic-investor-password");
    assert.equal(
      (
        (await (
          await call("mt5/worker/claim", "POST", {}, "", worker)
        ).json()) as any
      ).job,
      null,
    );
    const base = {
      positionId: "9007199254740993",
      timeMsc: 1700000000000,
      symbol: "XAUUSD.a",
      volume: 0.03,
      price: 2000,
      profit: 0,
      commission: -1.5,
      swap: 0,
      fee: 0,
      sl: 1980,
      tp: 2050,
    };
    const snapshot = {
      account: {
        login: "12345678",
        server: "FundingPips-SIM1",
        currency: "EUR",
        readOnly: true,
      },
      deals: [
        { ...base, ticket: "9007199254740994", type: 0, entry: 0 },
        {
          ...base,
          ticket: "9007199254740995",
          timeMsc: 1700000060000,
          type: 1,
          entry: 1,
          price: 2020,
          profit: 60,
          swap: -2,
          fee: -0.5,
        },
      ],
      positions: [],
    };
    assert.equal(
      (
        await call(
          `mt5/worker/jobs/${job.id}/finish`,
          "POST",
          { lease: "wrong", snapshot },
          "",
          worker,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `mt5/worker/jobs/${job.id}/finish`,
          "POST",
          {
            lease: job.lease,
            snapshot: {
              ...snapshot,
              account: { ...snapshot.account, login: "99" },
            },
          },
          "",
          worker,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `mt5/worker/jobs/${job.id}/finish`,
          "POST",
          { lease: job.lease, snapshot },
          "",
          worker,
        )
      ).status,
      201,
    );
    const journal = (await (
      await call(`mt5/connections/${id}/journal`, "GET", undefined, alice)
    ).json()) as any;
    assert.equal(journal.total, 1);
    assert.equal(journal.summary.net, 54.5);
    assert.equal(journal.currency, "EUR");
    const tradeId = journal.trades[0].id;
    const annotation = {
      note: "First line\nSecond line",
      tags: ["London"],
      strategy: "Breakout",
      plannedRisk: 20,
    };
    assert.equal(
      (
        await call(
          `mt5/connections/${id}/trades/${tradeId}`,
          "PATCH",
          annotation,
          bob,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `mt5/connections/${id}/trades/${tradeId}`,
          "PATCH",
          annotation,
          alice,
        )
      ).status,
      200,
    );
    const publicState = await (
      await call("mt5/connections", "GET", undefined, alice)
    ).text();
    assert.ok(
      !publicState.includes("synthetic-investor-password") &&
        !publicState.includes(job.lease) &&
        !publicState.includes(saved.secret),
    );
    await db.query(
      "UPDATE mt5_jobs SET created_at=now()-interval '2 minutes' WHERE connection_id=$1",
      [id],
    );
    await call(`mt5/connections/${id}/sync`, "POST", {}, alice);
    const second = (
      (await (
        await call("mt5/worker/claim", "POST", {}, "", worker)
      ).json()) as any
    ).job;
    await call(
      `mt5/worker/jobs/${second.id}/finish`,
      "POST",
      { lease: second.lease, snapshot },
      "",
      worker,
    );
    const retry = (await (
      await call(`mt5/connections/${id}/journal`, "GET", undefined, alice)
    ).json()) as any;
    assert.equal(retry.total, 1);
    assert.equal(retry.trades[0].annotation.note, annotation.note);
    assert.equal(retry.trades[0].annotation.plannedRisk, 20);
    await db.query(
      "UPDATE mt5_jobs SET created_at=now()-interval '2 minutes' WHERE connection_id=$1",
      [id],
    );
    await call(`mt5/connections/${id}/sync`, "POST", {}, alice);
    const third = (
      (await (
        await call("mt5/worker/claim", "POST", {}, "", worker)
      ).json()) as any
    ).job;
    assert.equal(
      (await call(`mt5/connections/${id}`, "DELETE", undefined, bob)).status,
      404,
    );
    assert.equal(
      (await call(`mt5/connections/${id}`, "DELETE", undefined, alice)).status,
      200,
    );
    assert.equal(
      (
        await call(
          `mt5/worker/jobs/${third.id}/finish`,
          "POST",
          { lease: third.lease, snapshot },
          "",
          worker,
        )
      ).status,
      409,
      "Disconnected leases cannot import later",
    );
    assert.equal(
      (
        await db.query("SELECT secret FROM mt5_connections WHERE id=$1", [id])
      )[0].secret,
      null,
    );
    assert.equal(
      (
        (await (
          await call(`mt5/connections/${id}/journal`, "GET", undefined, alice)
        ).json()) as any
      ).total,
      1,
    );
    const workspace = (await (
      await call("workspace", "GET", undefined, alice)
    ).json()) as any;
    assert.deepEqual(
      workspace.sessions,
      [],
      "Broker history must not create fake replay sessions",
    );
  } finally {
    if (app) await app.close();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
