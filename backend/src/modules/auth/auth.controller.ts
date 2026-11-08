import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Res,
  HttpException,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { OAuthService } from "./oauth.service";
import { AuthRateService } from "./auth-rate.service";
import { Public } from "./public.decorator";
import { clearCookies, cookie, setCookie, userId } from "./auth.utils";
import { readJson } from "../../common/http/request-body";
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly rates: AuthRateService,
  ) {}
  private reply(
    res: Response,
    tokens: Awaited<ReturnType<AuthService["issue"]>>,
  ) {
    setCookie(res, "replay_access", tokens.access, 900000);
    setCookie(
      res,
      "replay_refresh",
      tokens.refresh,
      tokens.expiresAt.getTime() - Date.now(),
      "/api/auth",
    );
    return {
      user: tokens.user,
      accessExpiresIn: 900,
      refreshExpiresAt: tokens.expiresAt,
    };
  }
  @Public() @Get("providers") providers() {
    return this.oauth.enabled();
  }
  @Public() @Post("register") async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rates.check(req.ip || "unknown");
    return this.reply(
      res,
      await this.auth.issue(await this.auth.register(readJson(req, 4096))),
    );
  }
  @Public() @Post("login") async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rates.check(req.ip || "unknown");
    return this.reply(
      res,
      await this.auth.issue(await this.auth.login(readJson(req, 4096))),
    );
  }
  @Public() @Post("refresh") async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return this.reply(
        res,
        await this.auth.refresh(cookie(req, "replay_refresh")),
      );
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 401)
        clearCookies(res);
      throw e;
    }
  }
  @Public() @Post("logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(
      cookie(req, "replay_refresh"),
      /^Bearer (\S+)$/i.exec(req.headers.authorization || "")?.[1] ||
        cookie(req, "replay_access"),
    );
    clearCookies(res);
    return { ok: true };
  }
  @Get("me") me(@Req() req: Request) {
    return this.auth.me(userId(req));
  }
  @Patch("me") updateProfile(@Req() req: Request) {
    return this.auth.updateProfile(userId(req), readJson(req, 4096));
  }
  @Public() @Get(":provider/start") async start(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.rates.check(req.ip || "unknown");
    const flow = await this.oauth.begin(provider);
    setCookie(
      res,
      `replay_oauth_${provider}`,
      flow.browser,
      600000,
      "/api/auth",
    );
    res.redirect(flow.url);
  }
  @Public() @Get(":provider/callback") async callback(
    @Param("provider") provider: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const user = await this.oauth.complete(
        provider,
        String(req.query.state || ""),
        String(req.query.code || ""),
        cookie(req, `replay_oauth_${provider}`),
      );
      this.reply(res, await this.auth.issue(user));
      setCookie(res, `replay_oauth_${provider}`, "", 0, "/api/auth");
      res.redirect("/");
    } catch (error) {
      const body = error instanceof HttpException ? error.getResponse() : null;
      const code =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : "INTERNAL_ERROR";
      const known = [
        "ACCOUNT_EXISTS",
        "REGISTRATION_DISABLED",
        "ACCESS_DENIED",
        "INVALID_OAUTH_STATE",
        "OAUTH_FAILED",
        "OAUTH_UNAVAILABLE",
        "PROVIDER_DISABLED",
      ];
      const safeCode = known.includes(code) ? code : "INTERNAL_ERROR";
      Logger.warn(
        `OAuth callback failed: provider=${provider === "google" || provider === "github" ? provider : "unknown"}, code=${safeCode}`,
        "AuthController",
      );
      setCookie(res, `replay_oauth_${provider}`, "", 0, "/api/auth");
      const reason = [
        "ACCOUNT_EXISTS",
        "REGISTRATION_DISABLED",
        "ACCESS_DENIED",
      ].includes(safeCode)
        ? `&reason=${safeCode}`
        : "";
      res.redirect("/login?error=oauth" + reason);
    }
  }
}
