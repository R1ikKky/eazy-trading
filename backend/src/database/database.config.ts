import "reflect-metadata";
import "../config/environment";
import type { DataSourceOptions } from "typeorm";
import { Attachment } from "../modules/attachments/entities/attachment.entity";
import { Dataset } from "../modules/datasets/entities/dataset.entity";
import { Workspace } from "../modules/workspace/entities/workspace.entity";
import { InitialSchema1793500000000 } from "./migrations/1793500000000-initial-schema";

import {
  AuthUser,
  AuthSession,
  RefreshToken,
  OAuthAccount,
  OAuthState,
  AuthSecret,
} from "../modules/auth/entities/auth.entity";
import { Authentication1794100000000 } from "./migrations/1794100000000-authentication";
export function databaseOptions(): DataSourceOptions {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required. See .env.example.");
  return {
    type: "postgres",
    url: process.env.DATABASE_URL,
    entities: [
      Workspace,
      Dataset,
      Attachment,
      AuthUser,
      AuthSession,
      RefreshToken,
      OAuthAccount,
      OAuthState,
      AuthSecret,
    ],
    migrations: [InitialSchema1793500000000, Authentication1794100000000],
    synchronize: false,
    migrationsRun: true,
  };
}
