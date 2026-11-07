import { Module } from "@nestjs/common";
import { OrderflowController } from "./orderflow.controller";
import { OrderflowService } from "./orderflow.service";
@Module({ controllers: [OrderflowController], providers: [OrderflowService] })
export class OrderflowModule {}
