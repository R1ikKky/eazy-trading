import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Dataset } from "./entities/dataset.entity";
import { DatasetController } from "./datasets.controller";
import { DatasetService } from "./dataset.service";
@Module({
  imports: [TypeOrmModule.forFeature([Dataset])],
  controllers: [DatasetController],
  providers: [DatasetService],
  exports: [DatasetService],
})
export class DatasetModule {}
