import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "./database/database.module";
import { LocalGuard } from "./common/guards/local.guard";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { DatasetModule } from "./modules/datasets/datasets.module";
import { AttachmentModule } from "./modules/attachments/attachments.module";
import { MarketDataModule } from "./modules/market-data/market-data.module";
import { OrderflowModule } from "./modules/orderflow/orderflow.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuthGuard } from "./modules/auth/auth.guard";
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrderflowModule,
    WorkspaceModule,
    DatasetModule,
    AttachmentModule,
    MarketDataModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: LocalGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
