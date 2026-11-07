export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  contract?: string;
}
export interface DatasetInput extends Record<string, unknown> {
  id: string;
  symbol: "NQ" | "ES";
  name: string;
  source: string;
  metadata: Record<string, unknown>;
  bars: Bar[];
}
