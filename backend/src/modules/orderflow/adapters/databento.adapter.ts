import { spawn, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { PROJECT_ROOT } from "../../../config/environment";
import type { TradeEvent } from "@eazy-trading/orderflow";
export type FeedMessage =
  | { type: "trade"; event: TradeEvent }
  | { type: "status"; state: "connecting" | "live" | "interrupted" }
  | { type: "gap"; message: string; fromNs?: string };
/** Only this boundary knows Databento, credentials, SDK process, and subscription settings. */
export class DatabentoAdapter {
  private child?: ChildProcess;
  start(
    contracts: Record<string, string>,
    receive: (message: FeedMessage) => void,
  ) {
    const child = (this.child = spawn(
      process.env.DATABENTO_PYTHON || "python3",
      [resolve(PROJECT_ROOT, "backend/providers/databento_live.py")],
      {
        env: { ...process.env, ORDERFLOW_CONTRACTS: JSON.stringify(contracts) },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ));
    createInterface({ input: child.stdout! }).on("line", (line) => {
      try {
        receive(JSON.parse(line));
      } catch {
        receive({ type: "gap", message: "Invalid provider event" });
      }
    });
    child.stderr?.on("data", () => {}); // SDK stderr can contain connection details; never expose it to customers.
    child.on("error", () => receive({ type: "status", state: "interrupted" }));
    child.on("exit", () => receive({ type: "status", state: "interrupted" }));
  }
  stop() {
    this.child?.kill("SIGTERM");
  }
}
