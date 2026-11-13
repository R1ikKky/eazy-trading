/** Prices and timestamps are preserved exactly from the source archives. */
export type Instrument = "NQ" | "ES";
export type Side = 1 | -1;
export type OrderKind = "market" | "limit" | "stop";
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  contract?: string;
}
export interface OrderOptions {
  chartProtection?: true;
  qty: number;
  stop: number;
  target: number;
  fee?: number;
  slip?: number;
  kind?: OrderKind;
  entryPrice?: number | null;
}
export interface PendingOrder {
  chartProtection?: true;
  id: string;
  side: Side;
  qty: number;
  stop: number;
  target: number;
  fee: number;
  slip: number;
  kind: OrderKind;
  entryPrice: number | null;
  queuedIndex: number;
  queuedTime: number;
  queuedContract: string | null;
}
export interface Exit {
  qty: number;
  price: number;
  time: number;
  points: number;
  gross: number;
  fees: number;
  pnl: number;
  reason: string;
  ambiguous: boolean;
  sl: number | null;
  tp: number | null;
}
export interface Position extends PendingOrder {
  riskStop?: number;
  entryAtClose?: true;
  contract: string | null;
  entry: number;
  time: number;
  entryAtOpen: boolean;
  sl: number | null;
  tp: number | null;
  initialQty: number;
  initialRisk: number;
  exits: Exit[];
  realizedNet: number;
  realizedGross: number;
  realizedFees: number;
}
export interface Trade extends Position {
  remainingQty: 0;
  symbol: Instrument;
  exit: number;
  exitTime: number;
  points: number;
  gross: number;
  fees: number;
  pnl: number;
  r: number | null;
  reason: string;
  ambiguous: boolean;
}
export interface ReplayFrame {
  index: number;
  position: Position | null;
  pending: PendingOrder | null;
  closePending: boolean;
  closeQty: number | null;
  tradeCount: number;
}
export interface ReplaySnapshot {
  rewind?: ReplayFrame[];
  version: 1;
  symbol: Instrument;
  index: number;
  currentTime: number;
  dataSignature: string;
  position: Position | null;
  pending: PendingOrder | null;
  closePending: boolean;
  closeQty: number | null;
  trades: Trade[];
}
