import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { fail } from "../../common/exceptions/api-error";
import { cookie } from "./auth.utils";
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("publicAuth", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { authUserId?: string }>();
    const bearer = /^Bearer (\S+)$/i.exec(req.headers.authorization || "")?.[1];
    req.authUserId = await this.auth.authenticate(
      bearer || cookie(req, "replay_access"),
    );
    // A stale browser tab must not save its previous user's draft with new cookies.
    const expected = req.headers["x-replay-user"];
    if (expected && expected !== req.authUserId)
      fail(409, "ACCOUNT_CHANGED", "Account changed. Reload the workspace.");
    return true;
  }
}
