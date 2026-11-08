import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { Client } from "pg";
import "../src/config/environment";
const requestFetch = globalThis.fetch;
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
const value = (jar: string, name: string) =>
  jar
    .split("; ")
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
test("authentication: isolation, JWT TTL, rotating refresh/reuse, logout, OAuth state/PKCE and verified identity", async () => {
  assert.ok(process.env.DATABASE_URL);
  const dbName = "replay_auth_test_" + randomUUID().replaceAll("-", "");
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + dbName;
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_ORIGIN = "http://127.0.0.1:3100";
  process.env.AUTH_JWT_SECRET = "test-secret-".repeat(8);
  process.env.AUTH_REGISTRATION_ENABLED = "true";
  process.env.AUTH_OWNER_EMAIL = "owner@example.test";
  process.env.AUTH_BOOTSTRAP_PASSWORD = "short";
  process.env.AUTH_ALLOWED_EMAILS = "";
  process.env.GOOGLE_CLIENT_ID = "google-test";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  process.env.GITHUB_CLIENT_ID = "github-test";
  process.env.GITHUB_CLIENT_SECRET = "github-secret";
  const require = createRequire(import.meta.url);
  const { createApp } = require("../dist/main.js");
  const { JwtService } = require("@nestjs/jwt");
  const {
    AuthSession,
    AuthUser,
    RefreshToken,
    OAuthState,
  } = require("../dist/modules/auth/entities/auth.entity.js");
  let app: any;
  try {
    app = await createApp();
    const { DataSource: Source } = require("typeorm");
    const seedDb = app.get(Source);
    const {
      Workspace,
    } = require("../dist/modules/workspace/entities/workspace.entity.js");
    await seedDb.getRepository(Workspace).insert({
      ownerId: "local-owner",
      revision: 1,
      updatedAt: String(Date.now()),
      payload: {
        version: 1,
        sessions: [],
        playbooks: [],
        settings: { legacyOwner: true },
      },
    });
    await app.listen(0, "127.0.0.1");
    process.env.API_PORT = String(app.getHttpServer().address().port);
    const base = `http://127.0.0.1:${process.env.API_PORT}/api/`;
    const call = (
      path: string,
      method = "GET",
      body?: unknown,
      jar = "",
      extra = {},
    ) =>
      requestFetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          ...(method !== "GET"
            ? {
                origin: process.env.PUBLIC_ORIGIN!,
                "content-type": "application/json",
              }
            : {}),
          ...(jar ? { cookie: jar } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const register = async (name: string) => {
      const r = await call("auth/register", "POST", {
        username: name,
        email: name + "@example.test",
        password: "Good-private-password-2026",
      });
      assert.equal(r.status, 201);
      return { jar: cookies(r), user: (await r.json()).user };
    };
    assert.equal((await call("workspace")).status, 401);
    assert.equal((await call("orderflow/stream")).status, 401);
    assert.equal((await call("health")).status, 200);
    const ownerLogin = await call("auth/login", "POST", {
      login: "owner",
      password: "short",
    });
    assert.equal(ownerLogin.status, 201);
    const ownerWorkspace = await (
      await call("workspace", "GET", undefined, cookies(ownerLogin))
    ).json();
    assert.equal(ownerWorkspace.settings.legacyOwner, true);
    assert.equal(
      await seedDb
        .getRepository(Workspace)
        .findOneBy({ ownerId: "local-owner" }),
      null,
    );
    const alice = await register("alice"),
      bob = await register("bob");
    assert.equal(
      (
        await call("auth/register", "POST", {
          username: "alice2",
          email: "alice@example.test",
          password: "Good-private-password-2026",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call("auth/login", "POST", {
          login: "alice",
          password: "incorrect",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("auth/register", "POST", {
          username: "hacker",
          email: "owner@example.test",
          password: "Good-private-password-2026",
        })
      ).status,
      409,
    );
    const jwt = new JwtService();
    assert.equal(
      (
        await call("workspace", "PUT", {}, bob.jar, {
          "x-replay-user": alice.user.id,
        })
      ).status,
      409,
    );
    const claims = jwt.decode(value(alice.jar, "replay_access"));
    assert.equal(claims.exp - claims.iat, 900);
    assert.equal(claims.sub, alice.user.id);
    assert.equal(claims.type, "access");
    assert.equal(
      (
        await call("workspace", "GET", undefined, "", {
          authorization: "Bearer " + value(alice.jar, "replay_access"),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "workspace",
          "GET",
          undefined,
          "replay_access=" +
            value(alice.jar, "replay_access").slice(0, -5) +
            "xxxxx",
        )
      ).status,
      401,
    );
    const badAccess = jwt.sign(
      { ...claims, exp: Math.floor(Date.now() / 1000) - 1 },
      { secret: process.env.AUTH_JWT_SECRET },
    );
    assert.equal(
      (await call("workspace", "GET", undefined, "replay_access=" + badAccess))
        .status,
      401,
    );
    assert.equal(
      (
        await call(
          "workspace",
          "PUT",
          {
            version: 1,
            revision: 0,
            sessions: [],
            playbooks: [],
            settings: { private: "alice" },
          },
          alice.jar,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await call("workspace", "GET", undefined, bob.jar)).json())
        .settings.private,
      undefined,
    );
    assert.equal(
      (
        await (
          await call("workspace", "GET", undefined, bob.jar, {
            "oai-authenticated-user-id": alice.user.id,
          })
        ).json()
      ).settings.private,
      undefined,
    );
    assert.equal(
      (
        await call("workspace", "PUT", {}, alice.jar, {
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const ds = {
      id: "private-tape",
      symbol: "NQ",
      name: "private",
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
    assert.equal((await call("datasets", "POST", ds, alice.jar)).status, 201);
    assert.equal(
      (await call("datasets/private-tape", "GET", undefined, bob.jar)).status,
      404,
    );
    const refreshed = await call("auth/refresh", "POST", undefined, alice.jar);
    assert.equal(refreshed.status, 201);
    const newJar = cookies(refreshed);
    assert.notEqual(
      value(alice.jar, "replay_refresh"),
      value(newJar, "replay_refresh"),
    );
    assert.equal(
      (await call("workspace", "GET", undefined, newJar)).status,
      200,
    );
    assert.equal(
      (await call("auth/refresh", "POST", undefined, alice.jar)).status,
      401,
    );
    assert.equal(
      (await call("workspace", "GET", undefined, newJar)).status,
      401,
      "Refresh reuse revokes access to the whole session family",
    );
    const login = await call("auth/login", "POST", {
      login: "alice",
      password: "Good-private-password-2026",
    });
    const loginJar = cookies(login);
    assert.equal(login.status, 201);
    const sessionId = jwt.decode(value(loginJar, "replay_access")).sid;
    const { DataSource } = require("typeorm");
    const db = app.get(DataSource);
    const session = await db
      .getRepository(AuthSession)
      .findOneByOrFail({ id: sessionId });
    const duration = session.expiresAt.getTime() - Date.now();
    assert.ok(duration > 27 * 86400000 && duration <= 31 * 86400000);
    const stored = await db
      .getRepository(RefreshToken)
      .findOneByOrFail({ sessionId });
    assert.notEqual(stored.hash, value(loginJar, "replay_refresh"));
    assert.equal(
      (await call("auth/logout", "POST", undefined, loginJar)).status,
      201,
    );
    assert.equal(
      (await call("workspace", "GET", undefined, loginJar)).status,
      401,
    );
    const expired = await call("auth/login", "POST", {
      login: "alice@example.test",
      password: "Good-private-password-2026",
    });
    const expiredJar = cookies(expired);
    await db
      .getRepository(AuthSession)
      .update(
        { id: jwt.decode(value(expiredJar, "replay_access")).sid },
        { expiresAt: new Date(0) },
      );
    assert.equal(
      (await call("auth/refresh", "POST", undefined, expiredJar)).status,
      401,
    );
    const userRow = await db
      .getRepository(AuthUser)
      .findOneByOrFail({ id: alice.user.id });
    assert.ok(userRow.passwordHash.startsWith("scrypt:"));
    assert.ok(!userRow.passwordHash.includes("Good-private"));
    // Fake only fixed provider HTTPS endpoints. App HTTP still uses native fetch.
    let expectedChallenge = "";
    let badVerified = false;
    globalThis.fetch = async (input: any, init: any) => {
      const endpoint = String(input);
      if (
        endpoint.includes("/token") ||
        endpoint === "https://github.com/login/oauth/access_token"
      ) {
        const body = new URLSearchParams(init.body);
        assert.equal(body.get("code"), "fixture-code");
        assert.equal(
          createHash("sha256")
            .update(body.get("code_verifier")!)
            .digest("base64url"),
          expectedChallenge,
        );
        assert.ok(body.get("client_secret"));
        return new Response(
          JSON.stringify({ access_token: "fake-provider-token" }),
        );
      }
      if (endpoint === "https://openidconnect.googleapis.com/v1/userinfo")
        return new Response(
          JSON.stringify({
            sub: "google-123",
            email: "google@example.test",
            name: "Google user",
            email_verified: !badVerified,
          }),
        );
      if (endpoint === "https://api.github.com/user")
        return new Response(JSON.stringify({ id: 123, login: "github-user" }));
      if (endpoint === "https://api.github.com/user/emails")
        return new Response(
          JSON.stringify([
            {
              email: "github@example.test",
              primary: true,
              verified: !badVerified,
            },
          ]),
        );
      throw Error("Unexpected network request: " + endpoint);
    };
    const flow = async (provider: string) => {
      const start = await call(`auth/${provider}/start`);
      assert.equal(start.status, 302);
      const redirect = new URL(start.headers.get("location")!);
      expectedChallenge = redirect.searchParams.get("code_challenge")!;
      assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
      return {
        state: redirect.searchParams.get("state")!,
        jar: cookies(start),
      };
    };
    const google = await flow("google");
    assert.equal(
      (
        await call(
          `auth/google/callback?state=${google.state}&code=fixture-code`,
        )
      ).headers.get("location"),
      "/login?error=oauth",
    );
    const okGoogle = await call(
      `auth/google/callback?state=${google.state}&code=fixture-code`,
      "GET",
      undefined,
      google.jar,
      { "sec-fetch-site": "cross-site" },
    );
    assert.equal(okGoogle.headers.get("location"), "/");
    const googleJar = cookies(okGoogle);
    assert.equal(
      (await (await call("auth/me", "GET", undefined, googleJar)).json()).email,
      "google@example.test",
    );
    assert.equal(
      (
        await call(
          `auth/google/callback?state=${google.state}&code=fixture-code`,
          "GET",
          undefined,
          google.jar,
        )
      ).headers.get("location"),
      "/login?error=oauth",
    );
    badVerified = true;
    const githubBad = await flow("github");
    assert.equal(
      (
        await call(
          `auth/github/callback?state=${githubBad.state}&code=fixture-code`,
          "GET",
          undefined,
          githubBad.jar,
        )
      ).headers.get("location"),
      "/login?error=oauth",
    );
    badVerified = false;
    const github = await flow("github");
    const okGithub = await call(
      `auth/github/callback?state=${github.state}&code=fixture-code`,
      "GET",
      undefined,
      github.jar,
    );
    assert.equal(okGithub.headers.get("location"), "/");
    assert.equal(
      (
        await (
          await call("auth/me", "GET", undefined, cookies(okGithub))
        ).json()
      ).email,
      "github@example.test",
    );
    const state = await flow("google");
    await db
      .getRepository(OAuthState)
      .update(
        { hash: createHash("sha256").update(state.state).digest("hex") },
        { expiresAt: new Date(0) },
      );
    assert.equal(
      (
        await call(
          `auth/google/callback?state=${state.state}&code=fixture-code`,
          "GET",
          undefined,
          state.jar,
        )
      ).headers.get("location"),
      "/login?error=oauth",
    );
    // A changed bootstrap email with an existing username must not crash or take over its account.
    const originalOwner = await db
      .getRepository(AuthUser)
      .findOneByOrFail({ username: "owner" });
    await app.close();
    process.env.AUTH_OWNER_EMAIL = "changed-owner@example.test";
    process.env.AUTH_BOOTSTRAP_PASSWORD = "different";
    app = await createApp();
    await app.listen(0, "127.0.0.1");
    process.env.API_PORT = String(app.getHttpServer().address().port);
    const restarted = await requestFetch(
      `http://127.0.0.1:${process.env.API_PORT}/api/health`,
    );
    assert.equal(restarted.status, 200);
    const restartedDb = app.get(Source);
    const unchanged = await restartedDb
      .getRepository(AuthUser)
      .findOneByOrFail({ username: "owner" });
    assert.equal(unchanged.id, originalOwner.id);
    assert.equal(unchanged.email, originalOwner.email);
    assert.equal(unchanged.passwordHash, originalOwner.passwordHash);
    assert.equal(
      await restartedDb
        .getRepository(AuthUser)
        .findOneBy({ email: "changed-owner@example.test" }),
      null,
    );
  } finally {
    globalThis.fetch = requestFetch;
    if (app) await app.close();
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});
