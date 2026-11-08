import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DataSource, EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import {
  AuthUser,
  AuthSession,
  RefreshToken,
  OAuthAccount,
  AuthSecret,
} from "./entities/auth.entity";
import {
  checkPassword,
  digest,
  emailInput,
  hashPassword,
  opaque,
  origin,
  passwordInput,
  usernameInput,
  oneMonthFrom,
} from "./auth.utils";
import { fail } from "../../common/exceptions/api-error";
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private cleanup?: NodeJS.Timeout;
  private secret = "";
  private dummyHash = "";
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
  ) {}
  async onModuleInit() {
    this.cleanup = setInterval(() => {
      void this.db
        .transaction(async (m) => {
          await m.query('DELETE FROM auth_sessions WHERE "expiresAt" < NOW()');
          await m.query(
            'DELETE FROM auth_oauth_states WHERE "expiresAt" < NOW()',
          );
          await m.query("DELETE FROM auth_rate_limits WHERE expires < NOW()");
        })
        .catch(() => {});
    }, 3600000);
    this.cleanup.unref();
    const provided = process.env.AUTH_JWT_SECRET;
    if (provided && Buffer.byteLength(provided) < 32)
      throw Error("AUTH_JWT_SECRET must be at least 32 bytes");
    if (provided) this.secret = provided;
    else {
      await this.db
        .getRepository(AuthSecret)
        .createQueryBuilder()
        .insert()
        .values({ id: "jwt", value: opaque() + opaque() })
        .orIgnore()
        .execute();
      this.secret = (
        await this.db.getRepository(AuthSecret).findOneByOrFail({ id: "jwt" })
      ).value;
    }
    this.dummyHash = await hashPassword(opaque());
    if (process.env.AUTH_OWNER_EMAIL && process.env.AUTH_BOOTSTRAP_PASSWORD) {
      const email = emailInput(process.env.AUTH_OWNER_EMAIL);
      const passwordHash = await hashPassword(
        process.env.AUTH_BOOTSTRAP_PASSWORD,
      );
      await this.db.transaction(async (m) => {
        await m.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('auth-owner-bootstrap',0))",
        );
        let user = await m.getRepository(AuthUser).findOneBy({ email });
        if (!user) {
          const id = randomUUID();
          const inserted = await m
            .createQueryBuilder()
            .insert()
            .into(AuthUser)
            .values({
              id,
              username: usernameInput(
                process.env.AUTH_OWNER_USERNAME || "owner",
              ),
              email,
              displayName: "Owner",
              passwordHash,
              emailVerified: false,
            })
            .orIgnore()
            .returning("id")
            .execute();
          if (inserted.raw.length) await this.claimLegacy(m, id);
          else
            Logger.warn(
              "Owner bootstrap skipped: username or email already exists. Existing accounts are unchanged. Remove AUTH_BOOTSTRAP_PASSWORD after initial setup.",
              "AuthService",
            );
        }
      });
    }
  }
  private async claimLegacy(m: EntityManager, id: string) {
    // Explicit configured owner only. Never give old shared data to the first registrant.
    for (const table of ["workspaces", "datasets", "attachments"])
      await m.query(
        `UPDATE ${table} SET "ownerId"=$1 WHERE "ownerId"='local-owner'`,
        [id],
      );
  }
  publicUser(user: AuthUser) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
    };
  }
  allowed(email: string) {
    const allow = (process.env.AUTH_ALLOWED_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allow.length && !allow.includes(email))
      fail(403, "ACCESS_DENIED", "This account is not permitted.");
  }
  async register(input: any) {
    if (process.env.AUTH_REGISTRATION_ENABLED !== "true")
      fail(403, "REGISTRATION_DISABLED", "Registration is disabled.");
    const email = emailInput(input?.email),
      username = usernameInput(input?.username),
      password = passwordInput(input?.password);
    this.allowed(email);
    if (email === process.env.AUTH_OWNER_EMAIL?.trim().toLowerCase())
      fail(409, "ACCOUNT_EXISTS", "Use the configured owner sign-in method.");
    const user = this.db.getRepository(AuthUser).create({
      id: randomUUID(),
      username,
      email,
      displayName: username,
      passwordHash: await hashPassword(password),
      emailVerified: false,
    });
    try {
      await this.db.getRepository(AuthUser).insert(user);
    } catch (e: any) {
      if (e.code === "23505")
        fail(409, "ACCOUNT_EXISTS", "Email or username already in use.");
      throw e;
    }
    return user;
  }
  async login(input: any) {
    const identifier =
      typeof input?.login === "string" ? input.login.trim().toLowerCase() : "";
    const password =
      typeof input?.password === "string" &&
      Buffer.byteLength(input.password) <= 256
        ? input.password
        : "";
    const user =
      identifier.length <= 254
        ? await this.db.getRepository(AuthUser).findOne({
            where: [{ email: identifier }, { username: identifier }],
          })
        : null;
    const valid = await checkPassword(
      password,
      user?.passwordHash || this.dummyHash,
    );
    if (!user || !user.passwordHash || !valid)
      fail(401, "INVALID_CREDENTIALS", "Invalid login or password.");
    this.allowed(user.email || "");
    return user;
  }
  async issue(user: AuthUser) {
    const session = await this.db.getRepository(AuthSession).save({
      id: randomUUID(),
      userId: user.id,
      expiresAt: oneMonthFrom(),
      revokedAt: null,
    });
    const refresh = opaque();
    await this.db
      .getRepository(RefreshToken)
      .insert({ hash: digest(refresh), sessionId: session.id, usedAt: null });
    return this.tokens(user, session, refresh);
  }
  private tokens(user: AuthUser, session: AuthSession, refresh: string) {
    return {
      access: this.jwt.sign(
        { sub: user.id, sid: session.id, type: "access" },
        {
          secret: this.secret,
          algorithm: "HS256",
          expiresIn: 900,
          issuer: origin(),
          audience: "replay-api",
          jwtid: randomUUID(),
        },
      ),
      refresh,
      expiresAt: session.expiresAt,
      user: this.publicUser(user),
      accessExpiresIn: 900,
    };
  }
  async authenticate(token: string) {
    let claims: { sub: string; sid: string; type: string };
    try {
      claims = this.jwt.verify(token, {
        secret: this.secret,
        algorithms: ["HS256"],
        issuer: origin(),
        audience: "replay-api",
      });
      if (claims.type !== "access") throw Error();
    } catch {
      fail(401, "UNAUTHENTICATED", "Sign in required.");
    }
    const session = await this.db
      .getRepository(AuthSession)
      .findOneBy({ id: claims.sid, userId: claims.sub });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      fail(401, "UNAUTHENTICATED", "Sign in required.");
    const user = await this.db
      .getRepository(AuthUser)
      .findOneBy({ id: claims.sub });
    if (!user) fail(401, "UNAUTHENTICATED", "Sign in required.");
    this.allowed(user.email || "");
    return claims.sub;
  }
  async refresh(raw: string) {
    if (!/^[\w-]{43}$/.test(raw))
      fail(401, "INVALID_REFRESH", "Session expired.");
    const result = await this.db.transaction(async (m) => {
      const old = await m
        .getRepository(RefreshToken)
        .findOneBy({ hash: digest(raw) });
      if (!old) return null;
      const session = await m.getRepository(AuthSession).findOne({
        where: { id: old.sessionId },
        lock: { mode: "pessimistic_write" },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date())
        return null;
      const freshOld = await m
        .getRepository(RefreshToken)
        .findOneByOrFail({ hash: digest(raw) });
      if (freshOld.usedAt) {
        session.revokedAt = new Date();
        await m.save(session);
        return null;
      }
      const user = await m
        .getRepository(AuthUser)
        .findOneByOrFail({ id: session.userId });
      this.allowed(user.email || "");
      freshOld.usedAt = new Date();
      await m.save(freshOld);
      const next = opaque();
      await m.insert(RefreshToken, {
        hash: digest(next),
        sessionId: session.id,
        usedAt: null,
      });
      return this.tokens(user, session, next);
    });
    if (!result)
      fail(401, "INVALID_REFRESH", "Session expired. Sign in again.");
    return result;
  }
  onModuleDestroy() {
    if (this.cleanup) clearInterval(this.cleanup);
  }
  async logout(raw: string, access = "") {
    const token = await this.db
      .getRepository(RefreshToken)
      .findOneBy({ hash: digest(raw) });
    let sessionId = token?.sessionId;
    if (!sessionId && access) {
      try {
        const claims = this.jwt.verify<{ sid: string; type: string }>(access, {
          secret: this.secret,
          algorithms: ["HS256"],
          issuer: origin(),
          audience: "replay-api",
        });
        if (claims.type === "access") sessionId = claims.sid;
      } catch {}
    }
    if (sessionId)
      await this.db
        .getRepository(AuthSession)
        .update({ id: sessionId }, { revokedAt: new Date() });
  }
  async me(id: string) {
    return this.publicUser(
      await this.db.getRepository(AuthUser).findOneByOrFail({ id }),
    );
  }
  async updateProfile(id: string, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      fail(400, "INVALID_PROFILE", "Enter a display name.");
    const values = body as Record<string, unknown>;
    const name = typeof values.displayName === "string" ? values.displayName.trim() : "";
    if (Object.keys(values).some((key) => key !== "displayName") ||
        !name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name))
      fail(400, "INVALID_PROFILE", "Use a display name between 1 and 100 characters.");
    await this.db.getRepository(AuthUser).update({ id }, { displayName: name });
    return this.me(id);
  }
  async oauthUser(
    provider: string,
    subject: string,
    email: string,
    name: string,
  ) {
    this.allowed(email);
    return this.db.transaction(async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "oauth:" + provider + ":" + subject,
      ]);
      const account = await m
        .getRepository(OAuthAccount)
        .findOneBy({ provider, subject });
      if (account)
        return m
          .getRepository(AuthUser)
          .findOneByOrFail({ id: account.userId });
      if (await m.getRepository(AuthUser).findOneBy({ email }))
        fail(
          409,
          "ACCOUNT_EXISTS",
          "Use the original sign-in method. Accounts are not linked automatically.",
        );
      if (
        process.env.AUTH_OAUTH_REGISTRATION_ENABLED === "false" &&
        email !== process.env.AUTH_OWNER_EMAIL?.trim().toLowerCase()
      )
        fail(403, "REGISTRATION_DISABLED", "Registration is disabled.");
      const user = await m.save(AuthUser, {
        id: randomUUID(),
        email,
        username: null,
        displayName: name.slice(0, 100),
        passwordHash: null,
        emailVerified: true,
      });
      await m.insert(OAuthAccount, { provider, subject, userId: user.id });
      if (email === process.env.AUTH_OWNER_EMAIL?.trim().toLowerCase())
        await this.claimLegacy(m, user.id);
      return user;
    });
  }
}
