import { contracts } from "@eazy-trading/orderflow";
import { t } from "../i18n/language";

export function positionMetrics(
  d: any,
  { capital = 50000, bars = [], now = 0, symbol = "NQ" }: any = {},
) {
  const [entry, stop, target] = d.points;
  const contract = contracts[d.symbol || symbol] || contracts.NQ;
  const account = d.accountSize ?? capital;
  const riskPercent = d.riskPercent ?? 1;
  const risk = Math.abs(entry.price - stop.price);
  const reward = Math.abs(target.price - entry.price);
  const riskAmount = (account * riskPercent) / 100;
  const ratio = risk ? reward / risk : 0;
  const quantity = risk ? riskAmount / (risk * contract.point) : 0;
  const mark = bars.findLast((bar: any) => bar.time <= now)?.close;
  const pnl =
    Number.isFinite(mark) && now >= entry.time
      ? (mark - entry.price) *
        (d.type === "long-position" ? 1 : -1) *
        quantity *
        contract.point
      : 0;
  const compact = (value: number) => Number(value.toFixed(3)).toString();
  const level = (name: string, distance: number, amount: number) =>
    `${name}: ${distance.toFixed(2)} (${((100 * distance) / entry.price).toFixed(3)}%) ${Math.round(distance / contract.tick)}, ${t("Сумма")}: ${compact(amount)}`;
  return {
    quantity,
    pnl,
    ratio,
    riskAmount,
    stopAmount: account - riskAmount,
    targetAmount: account + riskAmount * ratio,
    stop: [level(t("Стоп"), risk, account - riskAmount)],
    target: [level(t("Цель"), reward, account + riskAmount * ratio)],
    entry: [
      `${t("Открытый P&L")}: ${pnl.toFixed(2)}, ${t("Кол-во")}: ${compact(quantity)}`,
      `${t("Риск/прибыль")}: ${compact(ratio)}`,
    ],
  };
}

/** Lay out readable selected-only badges inside the plot, including short/narrow panes. */
export function positionLabelLayout(
  levels: { kind: string; y: number; lines: string[]; color: string }[],
  {
    left,
    right,
    width,
    height,
    plotLeft = 0,
    measure,
  }: {
    left: number;
    right: number;
    width: number;
    height: number;
    plotLeft?: number;
    measure?: (text: string, size: number) => number;
  },
) {
  const plotWidth = Math.max(1, width - plotLeft - 8);
  const maxWidth = Math.min(
    340,
    plotWidth,
    Math.max(140, Math.min(right, width) - Math.max(left, plotLeft)),
  );
  const textWidth = (text: string, size: number) =>
    measure?.(text, size) ?? text.length * size * 0.56;
  const wrap = (rows: string[], size: number) =>
    rows.flatMap((row) => {
      const output: string[] = [];
      let line = "";
      for (const word of row.split(" ")) {
        const candidate = line ? line + " " + word : word;
        if (textWidth(candidate, size) <= maxWidth - 12) {
          line = candidate;
          continue;
        }
        if (line) {
          output.push(line);
          line = "";
        }
        if (textWidth(word, size) <= maxWidth - 12) {
          line = word;
          continue;
        }
        // Very narrow plots still keep long numeric values inside the badge.
        for (const char of word) {
          if (line && textWidth(line + char, size) > maxWidth - 12) {
            output.push(line);
            line = "";
          }
          line += char;
        }
      }
      if (line.trim()) output.push(line.trim());
      return output;
    });
  let fontSize = Math.max(8, Math.min(11, plotWidth / 55));
  let badges: any[];
  for (;;) {
    badges = levels
      .map((level) => {
        const lines = wrap(level.lines, fontSize);
        const lineHeight = fontSize * 1.25;
        const badgeWidth = Math.min(
          maxWidth,
          Math.max(...lines.map((line) => textWidth(line, fontSize)), 0) + 12,
        );
        const badgeHeight = lines.length * lineHeight + 8;
        return {
          ...level,
          lines,
          fontSize,
          lineHeight,
          width: badgeWidth,
          height: badgeHeight,
        };
      })
      .sort((a, b) => a.y - b.y);
    if (
      badges.reduce((sum, badge) => sum + badge.height + 4, 0) <= height - 4 ||
      fontSize <= 6
    )
      break;
    fontSize -= 0.5;
  }
  const scale = Math.min(
    1,
    Math.max(0, height - 4) /
      badges!.reduce((sum, badge) => sum + badge.height + 4, 0),
  );
  for (const badge of badges!) {
    badge.fontSize *= scale;
    badge.lineHeight *= scale;
    badge.height *= scale;
    badge.padding = 4 * scale;
  }
  const gap = 4 * scale;
  const entryY = levels.find((level) => level.kind === "entry")!.y;
  let bottom = 2;
  for (const badge of badges!) {
    badge.x = Math.max(
      plotLeft + 4,
      Math.min(width - badge.width - 4, (left + right - badge.width) / 2),
    );
    const desired =
      badge.kind === "entry"
        ? badge.y - badge.height / 2
        : badge.y < entryY
          ? badge.y - badge.height - 4
          : badge.y + 4;
    badge.top = Math.max(bottom, Math.min(height - badge.height - 2, desired));
    bottom = badge.top + badge.height + gap;
  }
  let ceiling = height - 2;
  for (const badge of badges!.slice().reverse()) {
    badge.top = Math.min(badge.top, ceiling - badge.height);
    ceiling = badge.top - gap;
  }
  // Keep the chart's bottom-left attribution clear on small panes.
  for (const badge of badges!) {
    if (
      badge.top + badge.height > height - 32 &&
      badge.x < plotLeft + 52 &&
      plotLeft + 56 + badge.width <= width - 4
    )
      badge.x = plotLeft + 56;
  }
  return badges!;
}
