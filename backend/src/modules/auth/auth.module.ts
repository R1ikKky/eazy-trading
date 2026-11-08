import { Global, Module, Controller, Get } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OAuthService } from "./oauth.service";
import { AuthRateService } from "./auth-rate.service";
import { Public } from "./public.decorator";
@Controller("health")
class HealthController {
  @Public() @Get() health() {
    return { ok: true };
  }
}
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, HealthController],
  providers: [AuthService, OAuthService, AuthRateService],
  exports: [AuthService],
})
export class AuthModule {}
