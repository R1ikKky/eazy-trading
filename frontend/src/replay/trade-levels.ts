/** Keep actual protection prices inside the visible candle scale. */
export function includeTradeLevels(info: any, levels: number[] = []) {
  const values = levels.filter((value) => Number.isFinite(value) && value > 0);
  if (!info || !values.length) return info;
  return {
    ...info,
    priceRange: {
      minValue: Math.min(info.priceRange.minValue, ...values),
      maxValue: Math.max(info.priceRange.maxValue, ...values),
    },
  };
}
