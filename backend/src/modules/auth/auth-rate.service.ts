import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { digest } from "./auth.utils";
import { fail } from "../../common/exceptions/api-error";
@Injectable()
export class AuthRateService {
  constructor(private readonly db: DataSource) {}
  async check(ip: string) {
    const rows = await this.db.query(
      `INSERT INTO auth_rate_limits (key,count,expires) VALUES ($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits.expires<NOW() THEN 1 ELSE auth_rate_limits.count+1 END, expires=CASE WHEN auth_rate_limits.expires<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE auth_rate_limits.expires END RETURNING count`,
      [digest(ip)],
    );
    if (rows[0].count > 30)
      fail(
        429,
        "TOO_MANY_ATTEMPTS",
        "Too many sign-in attempts. Try again in 15 minutes.",
      );
  }
}
