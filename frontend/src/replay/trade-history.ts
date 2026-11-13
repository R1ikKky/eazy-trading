type Execution = { time: number; price: number };
type HistoryTrade = {
  time: number;
  entry: number;
  side: number;
  exits?: Execution[];
  exitTime?: number;
  exit?: number;
};

export function executionHistory(
  trades: HistoryTrade[],
  position: HistoryTrade | null,
  candleTime: (time: number) => number,
) {
  return [...trades, ...(position ? [position] : [])].map((trade) => ({
    side: trade.side,
    color: trade.side === 1 ? "#259176" : "#d57470",
    entry: { time: candleTime(trade.time), price: trade.entry },
    // Draw every partial fill at its execution price, never the weighted average.
    exits: (trade.exits?.length
      ? trade.exits
      : trade.exitTime != null && trade.exit != null
        ? [{ time: trade.exitTime, price: trade.exit }]
        : []
    ).map((exit) => ({ time: candleTime(exit.time), price: exit.price })),
  }));
}

export function createTradeHistory(series: any) {
  let chart: any,
    requestUpdate = () => {};
  let history: ReturnType<typeof executionHistory> = [];
  const renderer = {
    draw(target: any) {
      if (!chart) return;
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }: any) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, mediaSize.width, mediaSize.height);
        ctx.clip();
        const point = (execution: Execution) => {
          const x = chart.timeScale().timeToCoordinate(execution.time);
          const y = series.priceToCoordinate(execution.price);
          return x == null || y == null ? null : { x, y };
        };
        const arrow = (p: { x: number; y: number }, direction: number) => {
          // The arrow's tip is exactly the time/price coordinate of the fill.
          const y = (offset: number) => p.y + offset * direction;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 4, y(6));
          ctx.lineTo(p.x + 1.5, y(6));
          ctx.lineTo(p.x + 1.5, y(13));
          ctx.lineTo(p.x - 1.5, y(13));
          ctx.lineTo(p.x - 1.5, y(6));
          ctx.lineTo(p.x - 4, y(6));
          ctx.closePath();
          ctx.fill();
        };
        for (const trade of history) {
          const entry = point(trade.entry);
          ctx.strokeStyle = ctx.fillStyle = trade.color;
          ctx.lineWidth = 1.5;
          const exits = trade.exits.map(point).filter((p) => p !== null);
          ctx.setLineDash([5, 4]);
          for (const exit of entry ? exits : []) {
            ctx.beginPath();
            ctx.moveTo(entry!.x, entry!.y);
            ctx.lineTo(exit.x, exit.y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          if (entry) arrow(entry, trade.side);
          for (const exit of exits) arrow(exit, -trade.side);
        }
        ctx.restore();
      });
    },
  };
  const views = [{ zOrder: () => "top" as const, renderer: () => renderer }];
  const primitive = {
    attached(params: any) {
      chart = params.chart;
      requestUpdate = params.requestUpdate;
    },
    detached() {
      chart = null;
      requestUpdate = () => {};
    },
    paneViews: () => views,
    setHistory(
      trades: HistoryTrade[],
      position: HistoryTrade | null,
      candleTime: (time: number) => number,
    ) {
      history = executionHistory(trades, position, candleTime);
      requestUpdate();
    },
  };
  series.attachPrimitive(primitive);
  return primitive;
}
