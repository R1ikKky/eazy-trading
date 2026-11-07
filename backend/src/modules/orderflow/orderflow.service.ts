import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  TradeTape,
  TradeEvent,
  instrumentOf,
  contracts,
} from "@replay-lab/orderflow";
import { DatabentoAdapter, FeedMessage } from "./adapters/databento.adapter";
export class FeedBuffer {
  readonly epoch = randomUUID();
  tape = new TradeTape();
  private entries: { cursor: number; event: TradeEvent }[] = [];
  private next = 0;
  state = "disabled";
  gaps: { message: string; at: string; fromNs?: string }[] = [];
  ingest(message: FeedMessage) {
    if (message.type === "status") {
      this.state = message.state;
      return;
    }
    if (message.type === "gap") {
      this.gaps.push({
        message: message.message,
        at: new Date().toISOString(),
        fromNs: message.fromNs,
      });
      this.gaps = this.gaps.slice(-20);
      return;
    }
    if (!this.tape.add(message.event)) return;
    this.entries.push({ cursor: ++this.next, event: message.event });
    if (this.entries.length > 200000) {
      this.entries = this.entries.slice(-100000);
      this.tape = new TradeTape();
      this.entries.forEach((e) => this.tape.add(e.event));
      this.ingest({
        type: "gap",
        message: "Retention limit reached; earlier live trades unavailable",
      });
    }
  }
  snapshot(after: number, epoch?: string) {
    const reset =
      epoch !== this.epoch || after < (this.entries[0]?.cursor || 0) - 1;
    return {
      epoch: this.epoch,
      cursor: this.next,
      reset,
      state: this.state,
      gaps: this.gaps,
      events: this.entries
        .filter((e) => reset || e.cursor > after)
        .map((e) => e.event),
    };
  }
}
@Injectable()
export class OrderflowService implements OnModuleInit, OnModuleDestroy {
  readonly buffer = new FeedBuffer();
  readonly demo = new FeedBuffer();
  private adapter = new DatabentoAdapter();
  private timer?: NodeJS.Timeout;
  private sequence = 0;
  private recent: TradeEvent[] = [];
  private pauseUntil = 0;
  readonly mode = process.env.ORDERFLOW_FEED || "disabled";
  readonly mapping: Record<string, string> = {
    NQ: process.env.ORDERFLOW_NQ_CONTRACT || "",
    ES: process.env.ORDERFLOW_ES_CONTRACT || "",
  };
  onModuleInit() {
    if (this.mode === "demo") {
      this.demo.state = "connecting";
      this.timer = setInterval(() => this.demoStep(), 250);
    }
    if (this.mode === "databento") {
      if (
        process.env.ORDERFLOW_CUSTOMER_ACCESS !== "true" ||
        process.env.ORDERFLOW_DATA_RIGHTS_CONFIRMED !== "true" ||
        !process.env.DATABENTO_API_KEY
      ) {
        this.buffer.ingest({
          type: "gap",
          message:
            "Live feed requires server credentials and access/rights configuration",
        });
        return;
      }
      try {
        for (const symbol of ["NQ", "ES"])
          if (instrumentOf(this.mapping[symbol]) !== symbol) throw Error();
      } catch {
        this.buffer.ingest({
          type: "gap",
          message: "Configure exact NQ and ES quarterly contracts",
        });
        return;
      }
      this.buffer.ingest({
        type: "gap",
        message:
          "New server stream: earlier trades are unavailable; initial candle may be partial",
      });
      this.buffer.state = "connecting";
      this.adapter.start(this.mapping, (m) => {
        try {
          this.buffer.ingest(m);
        } catch {
          this.buffer.ingest({
            type: "gap",
            message: "Provider event failed validation",
          });
        }
      });
    }
  }
  private demoStep() {
    if (Date.now() < this.pauseUntil) return;
    if (this.demo.state === "interrupted") {
      this.demo.state = "connecting";
      this.recent.forEach((event) =>
        this.demo.ingest({ type: "trade", event }),
      );
    }
    for (const instrument of ["NQ", "ES"] as const) {
      const n = this.sequence++;
      const step = n % 40;
      const price =
        (instrument === "NQ" ? 21000 : 6000) +
        (step < 24 ? step : 48 - step) * contracts[instrument].tick;
      const event: TradeEvent = {
        id: "demo-" + n,
        timeNs: (BigInt(Date.now()) * 1000000n).toString(),
        instrument,
        contract: instrument + "Z6",
        price,
        size: 1 + (n % 7),
        side: n % 9 === 0 ? "unknown" : step < 24 ? "buy" : "sell",
      };
      this.demo.ingest({ type: "trade", event });
      this.recent.push(event);
      this.recent = this.recent.slice(-12);
    }
    this.demo.state = "live";
  }
  disconnectDemo() {
    if (this.mode !== "demo") return;
    this.demo.state = "interrupted";
    this.pauseUntil = Date.now() + 2000;
  }
  snapshot(source: string, after: number, epoch?: string) {
    const demo = source === "demo";
    const enabled = demo ? this.mode === "demo" : this.mode === "databento";
    const b = demo ? this.demo : this.buffer;
    return {
      ...b.snapshot(after, epoch),
      state: enabled ? b.state : "disabled",
      label: demo ? "Demo" : "Databento",
      contracts: demo ? { NQ: "NQZ6", ES: "ESZ6" } : this.mapping,
    };
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.adapter.stop();
  }
}
