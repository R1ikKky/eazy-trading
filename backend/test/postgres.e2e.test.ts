import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import "../src/config/environment";
import { PROJECT_ROOT } from "../src/config/environment";

// Every run creates its own database. The configured database is never modified.
test("Nest API, PostgreSQL transactions, persistence, and SQLite migration", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "Set DATABASE_URL to a PostgreSQL server with CREATE DATABASE permission",
  );
  const database = "replay_test_" + randomUUID().replaceAll("-", "");
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + database;
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3100";
  process.env.AUTH_REGISTRATION_ENABLED = "true";
  const require = createRequire(import.meta.url);
  const { createApp } = require("../dist/main.js");
  let app: any;
  try {
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    let port = app.getHttpServer().address().port;
    process.env.API_PORT = String(port);
    let authCookie = "";
    const call = (
      path: string,
      method = "GET",
      value?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(`http://127.0.0.1:${port}/api/${path}`, {
        method,
        headers: {
          ...(authCookie ? { cookie: authCookie } : {}),
          ...(method !== "GET"
            ? {
                origin: process.env.PUBLIC_ORIGIN!,
                "content-type": "application/json",
              }
            : {}),
          ...headers,
        },
        ...(value === undefined
          ? {}
          : { body: Buffer.isBuffer(value) ? value : JSON.stringify(value) }),
      });
    assert.equal((await call("workspace")).status, 401);
    const registration = await call("auth/register", "POST", {
      email: "integration@example.test",
      username: "integration",
      password: "Integration-test-pass-2026",
    });
    assert.equal(registration.status, 201);
    authCookie = registration.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join("; ");
    const blank = {
      version: 1,
      revision: 0,
      sessions: [],
      playbooks: [],
      settings: {},
    };
    assert.deepEqual(await (await call("workspace")).json(), blank);
    assert.equal(
      (
        await call("workspace", "PUT", blank, {
          origin: "https://attacker.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("workspace", "PUT", blank, {
          "sec-fetch-site": "cross-site",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("workspace", "PUT", blank, { "content-type": "text/plain" }))
        .status,
      415,
    );
    assert.equal(
      (await call("workspace", "PUT", { ...blank, revision: -1 })).status,
      400,
    );
    const saved = { ...blank, settings: { view: "sessions" } };
    assert.equal((await call("workspace", "PUT", saved)).status, 200);
    assert.equal(
      (await (await call("workspace", "PUT", saved)).json()).unchanged,
      true,
    );
    const races = await Promise.all(
      ["A", "B"].map((winner) =>
        call("workspace", "PUT", {
          ...blank,
          revision: 1,
          settings: { winner },
        }),
      ),
    );
    assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
    const identical = await Promise.all(
      [1, 2].map(() =>
        call("workspace", "PUT", {
          ...blank,
          revision: 2,
          settings: { same: true },
        }),
      ),
    );
    assert.deepEqual(
      identical.map((r) => r.status),
      [200, 200],
    );
    assert.deepEqual(
      await Promise.all(identical.map(async (r) => (await r.json()).revision)),
      [3, 3],
    );
    const ds = {
      id: "test-bars",
      symbol: "NQ",
      name: "Test",
      source: "user_csv",
      bars: [
        {
          time: 1704704400,
          open: 100,
          high: 101,
          low: 99,
          close: 100.25,
          volume: 5,
        },
      ],
    };
    assert.equal((await call("datasets", "POST", ds)).status, 201);
    assert.equal((await call("datasets", "POST", ds)).status, 200);
    assert.equal(
      (await call("datasets", "POST", { ...ds, name: "Different" })).status,
      409,
    );
    assert.equal(
      (
        await call("datasets", "POST", {
          ...ds,
          id: "bad-bars",
          bars: [{ ...ds.bars[0], close: 100.1 }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("archives", "POST", {
          id: "archive-1",
          symbol: "NQ",
          name: "Archive",
          parts: [{ id: ds.id }],
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call("archives", "POST", {
          id: "archive-2",
          symbol: "NQ",
          name: "Archive",
          parts: [{ id: "archive-1" }],
        })
      ).status,
      400,
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0l8AAAAASUVORK5CYII=",
      "base64",
    );
    const upload = await call("attachments", "POST", png, {
      "content-type": "image/png",
      "x-filename": "test.png",
    });
    assert.equal(upload.status, 201);
    const attachment = await upload.json();
    assert.deepEqual(
      Buffer.from(
        await (await call("attachments/" + attachment.id)).arrayBuffer(),
      ),
      png,
    );
    assert.equal(
      (await call("attachments", "POST", png, { "content-type": "image/jpeg" }))
        .status,
      400,
    );
    assert.equal((await call("attachments/invalid")).status, 404);
    assert.equal(
      (await call("workspace", "PUT", Buffer.alloc(5 * 1024 * 1024 + 1, 32)))
        .status,
      413,
    );
    const catalog = JSON.parse(
      await readFile(join(PROJECT_ROOT, "data/market-archives.json"), "utf8"),
    );
    const part = catalog[0].parts[0];
    const archive = await call("market-data/" + part.id + "?v=" + part.sha256);
    assert.equal(archive.status, 200);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await archive.text(), "base64"))
        .digest("hex"),
      part.sha256,
    );
    assert.equal(
      (await call("market-data/" + part.id + "?v=wrong")).status,
      404,
    );
    const { DataSource } = require("typeorm");
    const {
      WorkspaceService,
    } = require("../dist/modules/workspace/workspace.service.js");
    assert.deepEqual(
      await app.get(WorkspaceService).get("someone-else"),
      blank,
    );
    const before = await (await call("workspace")).json();
    await app.close();
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    port = app.getHttpServer().address().port;
    process.env.API_PORT = String(port);
    assert.deepEqual(await (await call("workspace")).json(), before);
    assert.equal((await call("datasets/test-bars")).status, 200);
    assert.deepEqual(
      Buffer.from(
        await (await call("attachments/" + attachment.id)).arrayBuffer(),
      ),
      png,
    );
    // Generate a real old-format SQLite backup and immutable objects.
    const { createLocalStorage } =
      await import("../../scripts/local-server.mjs");
    const { api } = await import("../../worker/api.mjs");
    const directory = await mkdtemp(join(tmpdir(), "replay-import-"));
    const old = await createLocalStorage(directory);
    const oldRequest = (
      path: string,
      method: string,
      value: unknown,
      headers = {},
    ) =>
      api(
        new Request("http://local.test/api/" + path, {
          method,
          headers: {
            origin: "http://local.test",
            "oai-authenticated-user-id": "fixture-owner",
            "content-type": "application/json",
            ...headers,
          },
          body: Buffer.isBuffer(value) ? value : JSON.stringify(value),
        }),
        old.env,
      );
    const oldAttachment = await (
      await oldRequest("attachments", "POST", png, {
        "content-type": "image/png",
      })
    ).json();
    assert.equal((await oldRequest("datasets", "POST", ds)).status, 201);
    assert.equal(
      (
        await oldRequest("workspace", "PUT", {
          ...blank,
          settings: { attachment: oldAttachment },
        })
      ).status,
      200,
    );
    old.close();
    execFileSync(
      process.execPath,
      [join(PROJECT_ROOT, "backend/dist/scripts/import-sqlite.js"), directory],
      {
        env: process.env,
      },
    );
    assert.equal(
      (await app.get(WorkspaceService).get("fixture-owner")).revision,
      1,
    );
    const {
      Attachment,
    } = require("../dist/modules/attachments/entities/attachment.entity.js");
    assert.deepEqual(
      (
        await app
          .get(DataSource)
          .getRepository(Attachment)
          .findOneByOrFail({ ownerId: "fixture-owner", id: oldAttachment.id })
      ).content,
      png,
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          join(PROJECT_ROOT, "backend/dist/scripts/import-sqlite.js"),
          directory,
        ],
        { env: process.env, stdio: "pipe" },
      ),
    );
    assert.deepEqual(
      await (await call("workspace")).json(),
      before,
      "Failed import must not overwrite existing data",
    );
  } finally {
    if (app) await app.close();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
