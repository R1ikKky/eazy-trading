/** Explicit, atomic, read-only import of the old local storage. Never overwrites PostgreSQL rows. */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import db from "../database/data-source";
import { Workspace } from "../modules/workspace/entities/workspace.entity";
import { Dataset } from "../modules/datasets/entities/dataset.entity";
import { Attachment } from "../modules/attachments/entities/attachment.entity";
import type { WorkspacePayload } from "../modules/workspace/dto/workspace.dto";
interface StoredObject {
  content: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: { name?: string };
}
async function main() {
  const directory = process.argv[2];
  if (!directory)
    throw Error("Usage: npm run import:sqlite -- /path/to/.local-data");
  const sqlite = new DatabaseSync(resolve(directory, "workspace.sqlite"), {
    readOnly: true,
  });
  const load = async (key: string): Promise<StoredObject> =>
    JSON.parse(
      await readFile(
        resolve(
          directory,
          "objects",
          createHash("sha256").update(key).digest("hex") + ".json",
        ),
        "utf8",
      ),
    );
  try {
    await db.initialize();
    const summary = await db.transaction(async (manager) => {
      const workspaces = sqlite
        .prepare("SELECT * FROM replay_workspaces")
        .all();
      const datasets = sqlite.prepare("SELECT * FROM replay_datasets").all();
      const attachmentRefs = new Map<string, { ownerId: string; id: string }>();
      const collect = (value: unknown, ownerId: string) => {
        if (!value || typeof value !== "object") return;
        if (!Array.isArray(value)) {
          const v = value as Record<string, unknown>;
          if (typeof v.id === "string" && v.url === "/api/attachments/" + v.id)
            attachmentRefs.set(ownerId + "/" + v.id, { ownerId, id: v.id });
        }
        for (const child of Object.values(value)) collect(child, ownerId);
      };
      for (const row of workspaces) {
        const ownerId = String(row.user_id),
          object = await load(String(row.object_key));
        const payload = JSON.parse(
          Buffer.from(object.content, "base64").toString(),
        ) as WorkspacePayload;
        collect(payload, ownerId);
        await manager
          .createQueryBuilder()
          .insert()
          .into(Workspace)
          .values({
            ownerId,
            revision: Number(row.revision),
            payload: () => ":payload",
            updatedAt: String(row.updated_at),
          })
          .setParameter("payload", JSON.stringify(payload))
          .execute();
      }
      for (const row of datasets) {
        const object = await load(String(row.object_key));
        const content = Buffer.from(object.content, "base64");
        if (createHash("sha256").update(content).digest("hex") !== row.sha256)
          throw Error("Dataset checksum mismatch: " + row.id);
        await manager.insert(Dataset, {
          ownerId: String(row.user_id),
          id: String(row.id),
          sha256: String(row.sha256),
          symbol: String(row.symbol),
          name: String(row.name),
          count: Number(row.bar_count),
          payload: JSON.parse(content.toString()),
        });
      }
      for (const { ownerId, id } of attachmentRefs.values()) {
        const key =
          "users/" +
          createHash("sha256").update(ownerId).digest("hex") +
          "/attachments/" +
          id;
        const object = await load(key);
        await manager.insert(Attachment, {
          ownerId,
          id,
          name: object.customMetadata?.name || "Screenshot",
          contentType:
            object.httpMetadata?.contentType || "application/octet-stream",
          content: Buffer.from(object.content, "base64"),
        });
      }
      return {
        workspaces: workspaces.length,
        datasets: datasets.length,
        referencedAttachments: attachmentRefs.size,
      };
    });
    console.log("Import committed:", summary);
    console.log(
      "Original SQLite and object files were not changed. Unreferenced historical snapshots remain in the original backup.",
    );
  } finally {
    sqlite.close();
    if (db.isInitialized) await db.destroy();
  }
}
main().catch((error) => {
  console.error("Import rolled back:", error.message);
  process.exitCode = 1;
});
