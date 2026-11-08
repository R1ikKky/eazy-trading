import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { OAuthState } from "./entities/auth.entity";
import { digest, opaque, origin, emailInput } from "./auth.utils";
import { AuthService } from "./auth.service";
import { fail } from "../../common/exceptions/api-error";
const providers = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
  },
};
@Injectable()
export class OAuthService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthService,
  ) {}
  config(provider: string) {
    if (provider !== "google" && provider !== "github")
      fail(404, "NOT_FOUND", "Unknown provider.");
    const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`],
      secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    if (!clientId || !secret)
      fail(
        503,
        "PROVIDER_DISABLED",
        "This sign-in provider is not configured.",
      );
    return {
      provider,
      ...providers[provider],
      clientId,
      secret,
      callback: `${origin()}/api/auth/${provider}/callback`,
    };
  }
  enabled() {
    return {
      google: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      github: !!(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ),
      registration: process.env.AUTH_REGISTRATION_ENABLED === "true",
    };
  }
  async begin(provider: string) {
    const c = this.config(provider),
      state = opaque(),
      browser = opaque(),
      verifier = opaque() + opaque();
    await this.db.getRepository(OAuthState).insert({
      hash: digest(state),
      provider,
      verifier,
      browserHash: digest(browser),
      expiresAt: new Date(Date.now() + 600000),
    });
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.callback,
      response_type: "code",
      scope:
        provider === "google" ? "openid email profile" : "read:user user:email",
      state,
      code_challenge: digestBase64(verifier),
      code_challenge_method: "S256",
    });
    return { url: c.authorize + "?" + params, browser };
  }
  async complete(
    provider: string,
    state: string,
    code: string,
    browser: string,
  ) {
    const c = this.config(provider);
    if (!/^[\w-]{43}$/.test(state) || !browser || !code || code.length > 4096)
      fail(400, "INVALID_OAUTH_STATE", "Invalid or expired sign-in attempt.");
    // Consume even a failed exchange so callback codes/state cannot be retried or replayed.
    const result = await this.db
      .createQueryBuilder()
      .delete()
      .from(OAuthState)
      .where(
        'hash=:hash AND provider=:provider AND "browserHash"=:browser AND "expiresAt">NOW()',
        { hash: digest(state), provider, browser: digest(browser) },
      )
      .returning("*")
      .execute();
    const saved = result.raw[0] as OAuthState | undefined;
    if (!saved)
      fail(400, "INVALID_OAUTH_STATE", "Invalid or expired sign-in attempt.");
    const token = await this.json(c.token, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.secret,
        code,
        redirect_uri: c.callback,
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
    });
    if (typeof token.access_token !== "string")
      fail(401, "OAUTH_FAILED", "Provider rejected sign-in.");
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
      "User-Agent": "ReplayLab",
    };
    let subject: string, email: string, name: string;
    if (provider === "google") {
      const profile = await this.json(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers },
      );
      if (typeof profile.sub !== "string" || profile.email_verified !== true)
        fail(401, "OAUTH_FAILED", "A verified provider email is required.");
      subject = profile.sub;
      email = emailInput(profile.email);
      name = typeof profile.name === "string" ? profile.name : email;
    } else {
      const profile = await this.json("https://api.github.com/user", {
        headers,
      });
      const emails = await this.json("https://api.github.com/user/emails", {
        headers,
      });
      if (!Number.isSafeInteger(profile.id) || !Array.isArray(emails))
        fail(401, "OAUTH_FAILED", "Provider profile unavailable.");
      const verified = emails.find(
        (e: any) => e.verified === true && e.primary === true,
      );
      if (!verified)
        fail(
          401,
          "OAUTH_FAILED",
          "A verified primary GitHub email is required.",
        );
      subject = String(profile.id);
      email = emailInput(verified.email);
      name = typeof profile.name === "string" ? profile.name : profile.login;
    }
    return this.auth.oauthUser(provider, subject, email, name);
  }
  private async json(url: string, init: RequestInit): Promise<any> {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
      if (!response.ok) throw Error();
      return await response.json();
    } catch {
      fail(
        502,
        "OAUTH_UNAVAILABLE",
        "Sign-in provider unavailable. Try again.",
      );
    }
  }
}
import { createHash } from "node:crypto";
function digestBase64(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
