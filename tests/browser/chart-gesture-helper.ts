import { expect, type Page } from "@playwright/test";

export async function trackGestureCharts(page: Page) {
  await page.addInitScript(() => {
    let library: any;
    (window as any).__gestureCharts = [];
    Object.defineProperty(window, "LightweightCharts", {
      configurable: true,
      get: () => library,
      set(value) {
        library = {
          ...value,
          createChart(...args: any[]) {
            const chart = value.createChart(...args),
              add = chart.addSeries.bind(chart);
            chart.addSeries = (...options: any[]) => {
              const series = add(...options);
              if (options[0] === value.CandlestickSeries)
                (window as any).__gestureCharts.push({
                  id: args[0].id,
                  chart,
                  series,
                });
              return series;
            };
            return chart;
          },
        };
      },
    });
  });
}

export async function drawLevels(
  page: Page,
  entry: number,
  sl: number,
  tp: number,
  registry = "__gestureCharts",
  fitPanes = ["chart"],
) {
  const span = Math.max(Math.abs(entry - sl), Math.abs(entry - tp), 5);
  await page.evaluate(
    ({ registry, fitPanes, entry, sl, tp, span }) => {
      for (const c of (window as any)[registry])
        if (fitPanes.includes(c.id))
          c.series
            .priceScale()
            .setVisibleRange({
              from: Math.min(entry, sl, tp) - span * 0.2,
              to: Math.max(entry, sl, tp) + span * 0.2,
            });
    },
    { registry, fitPanes, entry, sl, tp, span },
  );
  await page.waitForTimeout(100);
  for (const price of [sl, tp]) {
    const points = await page.evaluate(
      ({ registry, entry, price }) => {
        const c = (window as any)[registry].find((c: any) => c.id === "chart"),
          box = document.getElementById("chart")!.getBoundingClientRect();
        return {
          x: box.x + c.chart.paneSize().width * 0.5,
          from: box.y + c.series.priceToCoordinate(entry),
          to: box.y + c.series.priceToCoordinate(price),
        };
      },
      { registry, entry, price },
    );
    await page.mouse.move(points.x, points.from);
    await page.mouse.down();
    await page.mouse.move(points.x, points.to, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator("#saveStatus")).toHaveAttribute(
    "data-state",
    "saved",
    { timeout: 30000 },
  );
}
