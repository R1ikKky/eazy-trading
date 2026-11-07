import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { isDeepStrictEqual } from "node:util";
import { Workspace } from "./entities/workspace.entity";
import { fail } from "../../common/exceptions/api-error";
import { object } from "../../common/validation/json";
import { workspaceValidation } from "./validation/workspace.validation";

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DataSource) {}
  async get(ownerId: string) {
    const row = await this.db.getRepository(Workspace).findOneBy({ ownerId });
    return row
      ? { ...row.payload, revision: row.revision }
      : { version: 1, sessions: [], playbooks: [], settings: {}, revision: 0 };
  }
  async put(ownerId: string, input: unknown) {
    const payload = workspaceValidation(input);
    const revision = object(input) ? (input.revision as number) : 0;
    return this.db.transaction(async (manager) => {
      // Serialize the first save too: row locks cannot lock a row that does not exist.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [ownerId],
      );
      const repository = manager.getRepository(Workspace);
      const previous = await repository.findOneBy({ ownerId });
      const actual = previous?.revision ?? 0;
      if (actual !== revision) {
        if (previous && isDeepStrictEqual(previous.payload, payload))
          return {
            ok: true,
            version: 1,
            revision: actual,
            updatedAt: Number(previous.updatedAt),
            unchanged: true,
          };
        fail(
          409,
          "REVISION_CONFLICT",
          "Рабочее пространство изменилось. Загрузите свежую версию.",
          { revision: actual },
        );
      }
      const now = Date.now();
      await repository.save({
        ownerId,
        revision: actual + 1,
        payload,
        updatedAt: String(now),
      });
      return { ok: true, version: 1, revision: actual + 1, updatedAt: now };
    });
  }
}
