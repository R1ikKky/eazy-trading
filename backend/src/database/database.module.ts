import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { databaseOptions } from "./database.config";
@Module({ imports: [TypeOrmModule.forRoot(databaseOptions())] })
export class DatabaseModule {}
