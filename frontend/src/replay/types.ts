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
  qty: number;
  stop: number;
  target: number;
  fee?: number;
  slip?: number;
  kind?: OrderKind;
  entryPrice?: number | null;
}
export interface PendingOrder {
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
  sl: number;
  tp: number;
}
export interface Position extends PendingOrder {
  entryAtClose?: true;
  contract: string | null;
  entry: number;
  time: number;
  entryAtOpen: boolean;
  sl: number;
  tp: number;
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
  r: number;
  reason: string;
  ambiguous: boolean;
}
export interface ReplaySnapshot {
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
