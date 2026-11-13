import { isDrawingType, drawingTool } from "./drawing-catalog";
export type DrawingPoint = { time: number; price: number };
export function sanitizeDrawing(d: any): any | null {
  const validPoint = (p: any) =>
    p &&
    Number.isFinite(p.time) &&
    p.time > 0 &&
    p.time <= 4102444800 &&
    Number.isFinite(p.price) &&
    p.price > 0 &&
    p.price <= 1e8;
  if (
    !d ||
    !isDrawingType(d.type) ||
    typeof d.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(d.id) ||
    !Number.isSafeInteger(d.createdAt) ||
    d.createdAt <= 0 ||
    d.createdAt > 4102444800 ||
    d.createdAt % 60 !== 0 ||
    !/^#[\da-f]{6}$/i.test(d.color) ||
    !Number.isFinite(d.width) ||
    d.width < 1 ||
    d.width > 4 ||
    !Number.isFinite(d.opacity) ||
    d.opacity < 0 ||
    d.opacity > 100
  )
    return null;
  if (d.symbol !== undefined && !["NQ", "ES"].includes(d.symbol)) return null;
  for (const [key, min, max] of [["accountSize", 1, 1e9], ["riskPercent", 0.01, 100]] as const) {
    if (d[key] !== undefined && (!Number.isFinite(d[key]) || d[key] < min || d[key] > max)) return null;
  }
  const points =
    d.points === undefined ? [d.a, ...(d.b ? [d.b] : [])] : d.points;
  if (
    !Array.isArray(points) ||
    !points.length ||
    points.length > 256 ||
    !points.every(validPoint)
  )
    return null;
  const tool = drawingTool(d.type)!;
  if (tool.points > 0 && points.length < tool.points) return null;
  if (tool.points <= 0 && points.length < 2) return null;
  if (
    d.text !== undefined &&
    (typeof d.text !== "string" || d.text.length > 500)
  )
    return null;
  if (tool.kind === "text" && typeof d.text !== "string") return null;
  const clean = points.map((p) => ({ time: p.time, price: p.price }));
  return {
    id: d.id,
    type: d.type,
    ...(d.symbol !== undefined ? { symbol: d.symbol } : {}),
    ...(d.accountSize !== undefined ? { accountSize: d.accountSize } : {}),
    ...(d.riskPercent !== undefined ? { riskPercent: d.riskPercent } : {}),
    createdAt: d.createdAt,
    a: clean[0],
    b: clean[1] || null,
    ...(d.points !== undefined ? { points: clean } : {}),
    ...(d.text !== undefined ? { text: d.text } : {}),
    color: d.color,
    width: d.width,
    opacity: d.opacity,
    dashed: !!d.dashed,
    hidden: !!d.hidden,
    ...(d.locked ? { locked: true } : {}),
  };
}
