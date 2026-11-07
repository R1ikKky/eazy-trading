import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "./database/database.module";
import { LocalGuard } from "./common/guards/local.guard";
import { WorkspaceModule } from "./modules/workspace/workspace.module";
import { DatasetModule } from "./modules/datasets/datasets.module";
import { AttachmentModule } from "./modules/attachments/attachments.module";
import { MarketDataModule } from "./modules/market-data/market-data.module";
import {OrderflowModule} from "./modules/orderflow/orderflow.module";
@Module({
  imports: [
    DatabaseModule,
    OrderflowModule,
    WorkspaceModule,
    DatasetModule,
    AttachmentModule,
    MarketDataModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: LocalGuard }],
})
export class AppModule {}
