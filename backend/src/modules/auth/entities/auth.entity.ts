import { Entity, PrimaryColumn, Column } from "typeorm";
@Entity("auth_users")
export class AuthUser {
  @PrimaryColumn("uuid") id!: string;
  @Column("text", { nullable: true, unique: true }) username!: string | null;
  @Column("text", { nullable: true, unique: true }) email!: string | null;
  @Column("text") displayName!: string;
  @Column("text", { nullable: true }) passwordHash!: string | null;
  @Column("boolean", { default: false }) emailVerified!: boolean;
}
@Entity("auth_sessions")
export class AuthSession {
  @PrimaryColumn("uuid") id!: string;
  @Column("uuid") userId!: string;
  @Column("timestamptz") expiresAt!: Date;
  @Column("timestamptz", { nullable: true }) revokedAt!: Date | null;
}
@Entity("auth_refresh_tokens")
export class RefreshToken {
  @PrimaryColumn("text") hash!: string;
  @Column("uuid") sessionId!: string;
  @Column("timestamptz", { nullable: true }) usedAt!: Date | null;
}
@Entity("auth_oauth_accounts")
export class OAuthAccount {
  @PrimaryColumn("text") provider!: string;
  @PrimaryColumn("text") subject!: string;
  @Column("uuid") userId!: string;
}
@Entity("auth_oauth_states")
export class OAuthState {
  @PrimaryColumn("text") hash!: string;
  @Column("text") provider!: string;
  @Column("text") verifier!: string;
  @Column("text") browserHash!: string;
  @Column("timestamptz") expiresAt!: Date;
}
@Entity("auth_secrets")
export class AuthSecret {
  @PrimaryColumn("text") id!: string;
  @Column("text") value!: string;
}
