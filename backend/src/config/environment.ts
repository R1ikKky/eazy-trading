import { config } from "dotenv";
import { resolve } from "node:path";
// src/config and dist/config have the same depth; no dependency on process.cwd().
export const PROJECT_ROOT = resolve(__dirname, "../../..");
config({
  path: [resolve(PROJECT_ROOT, "backend/.env"), resolve(PROJECT_ROOT, ".env")],
  quiet: true,
});
